"""Anti-Library ZDL (P4-ANT-SYNC)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit import record_audit
from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import deactivate_anti_entry, list_anti_library, upsert_anti_library
from ..schemas import AntiLibraryIn, AntiLibraryOut, AntiLibraryUpsertResult, DeactivateAntiIn
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/anti-library", tags=["anti-library"])


@router.get("", response_model=list[AntiLibraryOut], summary="Lister Anti-Library")
async def get_anti_library(
    active: bool = Query(default=True),
    limit: int = Query(default=500, ge=1, le=2000),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(require_role(Role.pm, Role.risk, Role.analyst)),
) -> list[AntiLibraryOut]:
    rows = await list_anti_library(session, active_only=active, limit=limit)
    return [AntiLibraryOut.model_validate(r) for r in rows]


@router.post("", response_model=AntiLibraryUpsertResult, summary="Upsert concepts")
async def push_anti_library(
    entries: list[AntiLibraryIn],
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> AntiLibraryUpsertResult:
    if not entries:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lot vide.")
    if len(entries) > settings.max_ingest_batch:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Lot de {len(entries)} > max {settings.max_ingest_batch}.",
        )
    written = await upsert_anti_library(session, entries)
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="anti_library.upsert",
        resource="anti_library",
        details={"count": written, "concept_ids": [e.concept_id for e in entries[:30]]},
    )
    return AntiLibraryUpsertResult(received=len(entries), written=written)


@router.post("/deactivate", response_model=dict[str, bool | str], summary="Désactiver un concept")
async def deactivate_anti(
    body: DeactivateAntiIn,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> dict[str, bool | str]:
    cid = body.concept_id.strip()
    if not cid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "concept_id requis")
    ok = await deactivate_anti_entry(session, cid)
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="anti_library.deactivate" if ok else "anti_library.deactivate.noop",
        resource=cid,
        details={"ok": ok},
    )
    return {"concept_id": cid, "deactivated": ok}
