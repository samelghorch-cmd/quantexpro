"""P4-SSO — JWT de session (HS256 stdlib) + OIDC (échange PKCE / claims).

Pas de dépendance cryptography : signatures session en HMAC-SHA256 pur.
Pour un id_token OIDC reçu directement, on vérifie iss/aud/exp sur le payload ;
après ``/oidc/exchange`` le token vient du provider en TLS (confiance canal).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from .config import Settings
from .security import DEFAULT_ROLE, Role

_logger = logging.getLogger(__name__)

_ISSUER = "quantexpro"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _json_b64(obj: dict[str, Any]) -> str:
    return _b64url_encode(json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def encode_hs256(payload: dict[str, Any], secret: str) -> str:
    header = _json_b64({"alg": "HS256", "typ": "JWT"})
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{body}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url_encode(sig)}"


def decode_hs256(token: str, secret: str, *, issuer: str | None = _ISSUER) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("JWT malformé")
    header_b64, body_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{body_b64}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(_b64url_encode(expected), sig_b64):
        # compare raw bytes too (padding variants)
        try:
            got = _b64url_decode(sig_b64)
        except Exception as exc:
            raise ValueError("signature JWT illisible") from exc
        if not hmac.compare_digest(expected, got):
            raise ValueError("signature JWT invalide")
    try:
        payload = json.loads(_b64url_decode(body_b64))
    except Exception as exc:
        raise ValueError("payload JWT illisible") from exc
    if not isinstance(payload, dict):
        raise ValueError("payload JWT non-objet")
    if issuer is not None and payload.get("iss") != issuer:
        raise ValueError("issuer JWT invalide")
    now = int(time.time())
    exp = payload.get("exp")
    if exp is not None and int(exp) < now:
        raise ValueError("JWT expiré")
    for req in ("sub", "role", "iat"):
        if req not in payload:
            raise ValueError(f"claim manquant : {req}")
    return payload


def decode_jwt_payload(token: str) -> dict[str, Any]:
    """Décode le payload sans vérifier la signature (après échange OIDC TLS)."""
    parts = token.split(".")
    if len(parts) < 2:
        raise ValueError("JWT malformé")
    payload = json.loads(_b64url_decode(parts[1]))
    if not isinstance(payload, dict):
        raise ValueError("payload non-objet")
    return payload


def issue_session_token(
    *,
    sub: str,
    role: Role,
    settings: Settings,
    auth_method: str = "api_key",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Émet un JWT de session desk (HS256)."""
    now = int(time.time())
    ttl = settings.sso_ttl_s
    payload: dict[str, Any] = {
        "iss": _ISSUER,
        "sub": sub,
        "role": role.value,
        "amr": auth_method,
        "iat": now,
        "exp": now + ttl,
    }
    if extra:
        for k, v in extra.items():
            if v is not None and k not in payload:
                payload[k] = v
    token = encode_hs256(payload, settings.sso_signing_secret)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": ttl,
        "role": role.value,
        "sub": sub,
        "auth_method": auth_method,
    }


def decode_session_token(token: str, settings: Settings) -> dict[str, Any]:
    return decode_hs256(token, settings.sso_signing_secret, issuer=_ISSUER)


def map_oidc_role(claims: dict[str, Any], settings: Settings) -> Role:
    """Mappe un claim OIDC (groups/roles/email) vers un rôle RBAC."""
    claim_name = settings.oidc_role_claim or "groups"
    raw = claims.get(claim_name)
    values: list[str] = []
    if isinstance(raw, str):
        values = [raw]
    elif isinstance(raw, (list, tuple)):
        values = [str(v) for v in raw]
    elif claims.get("email"):
        values = [str(claims["email"])]

    role_map = settings.oidc_role_map or {}
    for v in values:
        mapped = role_map.get(v) or role_map.get(v.lower())
        if mapped:
            try:
                return Role(mapped)
            except ValueError:
                continue
    wildcard = role_map.get("*")
    if wildcard:
        try:
            return Role(wildcard)
        except ValueError:
            pass
    return DEFAULT_ROLE


def verify_oidc_id_token(id_token: str, settings: Settings) -> dict[str, Any]:
    """Contrôle iss / aud / exp sur id_token (payload).

    Signature JWKS optionnelle hors scope stdlib.
    """
    if not settings.oidc_enabled:
        raise ValueError("OIDC non configuré (QX_OIDC_ISSUER / QX_OIDC_CLIENT_ID)")
    claims = decode_jwt_payload(id_token)
    issuer = settings.oidc_issuer.rstrip("/")
    audience = settings.oidc_audience.strip() or settings.oidc_client_id
    iss = str(claims.get("iss") or "").rstrip("/")
    if iss != issuer:
        raise ValueError(f"issuer OIDC inattendu ({iss})")
    aud = claims.get("aud")
    aud_ok = aud == audience or (isinstance(aud, list) and audience in aud)
    if not aud_ok:
        raise ValueError("audience OIDC invalide")
    exp = claims.get("exp")
    if exp is None or int(exp) < int(time.time()):
        raise ValueError("id_token expiré")
    if not claims.get("sub"):
        raise ValueError("id_token sans sub")
    return claims


async def exchange_oidc_code(
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    settings: Settings,
) -> dict[str, Any]:
    """Échange authorization code + PKCE contre tokens OIDC (côté serveur)."""
    if not settings.oidc_enabled:
        raise ValueError("OIDC non configuré")
    issuer = settings.oidc_issuer.rstrip("/")
    async with httpx.AsyncClient(timeout=20.0) as client:
        conf = (await client.get(f"{issuer}/.well-known/openid-configuration")).json()
        token_url = conf["token_endpoint"]
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": settings.oidc_client_id,
            "code_verifier": code_verifier,
        }
        if settings.oidc_client_secret:
            data["client_secret"] = settings.oidc_client_secret
        res = await client.post(token_url, data=data)
        if res.status_code >= 400:
            raise ValueError(f"échange OIDC échoué ({res.status_code}): {res.text[:200]}")
        payload: dict[str, Any] = res.json()
        return payload
