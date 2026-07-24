"""P4-SSO — session JWT, OIDC PKCE exchange, /v1/auth/me."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import Settings, get_settings
from ..security import Principal, get_principal
from ..sso import (
    exchange_oidc_code,
    issue_session_token,
    map_oidc_role,
    verify_oidc_id_token,
)

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class OidcIdTokenBody(BaseModel):
    id_token: str = Field(min_length=20)


class OidcCodeBody(BaseModel):
    code: str = Field(min_length=4)
    code_verifier: str = Field(min_length=43, max_length=128)
    redirect_uri: str = Field(min_length=8)


@router.get("/config")
async def auth_config(settings: Settings = Depends(get_settings)) -> dict:
    """Config publique SSO (pas de secrets) — pour le dashboard SPA."""
    issuer = settings.oidc_issuer.rstrip("/") if settings.oidc_enabled else ""
    return {
        "sso": True,
        "oidc_enabled": settings.oidc_enabled,
        "oidc_issuer": issuer,
        "oidc_client_id": settings.oidc_client_id if settings.oidc_enabled else "",
        "oidc_audience": (settings.oidc_audience or settings.oidc_client_id)
        if settings.oidc_enabled
        else "",
        "scopes": "openid email profile",
        "session_ttl_s": settings.sso_ttl_s,
    }


@router.post("/session")
async def create_session(
    principal: Principal = Depends(get_principal),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Échange une identité valide (clé API ou Bearer) contre un JWT de session."""
    if settings.is_production and not settings.sso_secret.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QX_SSO_SECRET requis en production pour émettre des sessions.",
        )
    # Si déjà SSO, renouvelle ; sinon clé API → session
    role = principal.role
    sub = principal.sub or principal.key_id
    amr = "api_key" if principal.auth_method in ("api_key", "dev") else principal.auth_method
    token = issue_session_token(sub=sub, role=role, settings=settings, auth_method=amr)
    _logger.info("sso_session_issued", extra={"sub": sub, "role": role.value})
    return token


@router.post("/oidc")
async def login_oidc_id_token(
    body: OidcIdTokenBody,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Valide un id_token OIDC et émet un JWT de session QuantEXPro."""
    if not settings.oidc_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OIDC désactivé")
    if settings.is_production and not settings.sso_secret.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QX_SSO_SECRET requis en production.",
        )
    try:
        claims = verify_oidc_id_token(body.id_token, settings)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"id_token invalide : {exc}",
        ) from exc
    role = map_oidc_role(claims, settings)
    sub = str(claims.get("email") or claims.get("sub") or "oidc")[:128]
    token = issue_session_token(
        sub=sub,
        role=role,
        settings=settings,
        auth_method="oidc",
        extra={"email": claims.get("email"), "oidc_sub": claims.get("sub")},
    )
    _logger.info("sso_oidc_login", extra={"sub": sub, "role": role.value})
    return token


@router.post("/oidc/exchange")
async def login_oidc_code(
    body: OidcCodeBody,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Échange code PKCE → id_token (proxy serveur) → JWT session."""
    if not settings.oidc_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OIDC désactivé")
    try:
        tokens = await exchange_oidc_code(
            code=body.code,
            code_verifier=body.code_verifier,
            redirect_uri=body.redirect_uri,
            settings=settings,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Réponse OIDC sans id_token",
        )
    return await login_oidc_id_token(OidcIdTokenBody(id_token=id_token), settings)


@router.get("/me")
async def auth_me(principal: Principal = Depends(get_principal)) -> dict:
    """Identité courante (clé API ou Bearer SSO)."""
    return {
        "key_id": principal.key_id,
        "role": principal.role.value,
        "sub": principal.sub,
        "auth_method": principal.auth_method,
    }
