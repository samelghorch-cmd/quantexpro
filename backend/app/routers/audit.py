"""Lecture du journal d'audit (PM / Risque)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..repositories import list_audit
from ..schemas import AuditOut
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditOut], summary="Événements d'audit (append-only)")
async def read_audit(
    after_id: int | None = Query(default=None, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> list[AuditOut]:
    rows = await list_audit(session, limit=limit, after_id=after_id)
    return [AuditOut.model_validate(r) for r in rows]
