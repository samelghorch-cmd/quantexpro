"""Journal d'audit immuable — hash canonique du payload + insertion append-only.

Le hash SHA-256 d'une représentation JSON canonique (clés triées) garantit l'intégrité :
toute altération ultérieure du détail serait détectable.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuditEvent


def payload_hash(details: dict[str, Any] | None) -> str:
    """SHA-256 hex d'un payload JSON canonique (déterministe, clés triées)."""
    canonical = json.dumps(details or {}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def record_audit(
    session: AsyncSession,
    *,
    actor: str,
    role: str,
    action: str,
    resource: str,
    details: dict[str, Any] | None = None,
) -> str:
    """Insère un événement d'audit (jamais de mise à jour/suppression). Retourne le hash."""
    digest = payload_hash(details)
    session.add(
        AuditEvent(
            actor=actor,
            role=role,
            action=action,
            resource=resource,
            payload_hash=digest,
            details=details,
        )
    )
    await session.flush()
    return digest
