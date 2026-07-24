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

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings

_logger = logging.getLogger(__name__)
_API_KEY_HEADER = "X-API-Key"


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
