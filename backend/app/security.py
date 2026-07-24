"""Authentification par clé d'API (header ``X-API-Key``).

Politique fail-safe :
  • si des clés sont configurées → seules ces clés sont acceptées (comparaison à temps
    constant contre les attaques par timing) ;
  • si AUCUNE clé n'est configurée → accès refusé en production, autorisé en development
    (confort local), avec un avertissement loggé.
"""

from __future__ import annotations

import hmac
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings

_logger = logging.getLogger(__name__)
_API_KEY_HEADER = "X-API-Key"


class Role(StrEnum):
    """Rôles institutionnels (gouvernance)."""

    pm = "pm"          # Portfolio Manager — crée/valide les signaux
    analyst = "analyst"  # Analyste — recherche, lecture
    risk = "risk"      # Risque — supervise, peut bloquer
    ea = "ea"          # Pont MT5 (Expert Advisor) — pull/ACK exécutions


DEFAULT_ROLE = Role.analyst


@dataclass(frozen=True)
class Principal:
    """Identité authentifiée résolue depuis la clé d'API."""

    key_id: str
    role: Role


def _resolve_role(api_key: str, settings: Settings) -> Role | None:
    """Résout le rôle d'une clé (mapping explicite, sinon clé générale = rôle par défaut)."""
    for key, role in settings.api_key_roles.items():
        if hmac.compare_digest(api_key, key):
            try:
                return Role(role)
            except ValueError:
                return DEFAULT_ROLE
    if any(hmac.compare_digest(api_key, k) for k in settings.api_keys):
        return DEFAULT_ROLE
    return None


def _valid_key(candidate: str, allowed: tuple[str, ...]) -> bool:
    return any(hmac.compare_digest(candidate, key) for key in allowed)


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias=_API_KEY_HEADER),
    settings: Settings = Depends(get_settings),
) -> str:
    """Dépendance FastAPI : valide la clé et renvoie l'identité (préfixe de la clé)."""
    if not settings.api_keys:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Aucune clé d'API configurée (QX_API_KEYS) — API verrouillée.",
            )
        _logger.warning("api_keys_empty_dev_mode", extra={"env": settings.env})
        return "dev"

    if not x_api_key or not _valid_key(x_api_key, settings.api_keys):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé d'API manquante ou invalide.",
            headers={"WWW-Authenticate": _API_KEY_HEADER},
        )
    # Identité tracée = 6 premiers caractères (jamais la clé complète dans les logs).
    return x_api_key[:6]


async def get_principal(
    x_api_key: str | None = Header(default=None, alias=_API_KEY_HEADER),
    settings: Settings = Depends(get_settings),
) -> Principal:
    """Dépendance : authentifie et résout le rôle (RBAC)."""
    if not settings.api_keys and not settings.api_key_roles:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Aucune clé d'API configurée — API verrouillée.",
            )
        return Principal(key_id="dev", role=Role.pm)  # dev : accès complet local

    role = _resolve_role(x_api_key or "", settings)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé d'API manquante ou invalide.",
            headers={"WWW-Authenticate": _API_KEY_HEADER},
        )
    return Principal(key_id=(x_api_key or "")[:6], role=role)


def require_role(*allowed: Role) -> Callable[[Principal], Awaitable[Principal]]:
    """Fabrique une dépendance qui exige l'un des rôles ``allowed``."""

    async def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle '{principal.role}' non autorisé (requis : {', '.join(allowed)}).",
            )
        return principal

    return _dep
