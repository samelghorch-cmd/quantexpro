"""Alpha Forge — Validated Edges ZDL (P4-AF-SYNC)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit import record_audit
from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import list_validated_edges, retire_validated_edge, upsert_validated_edges
from ..schemas import EdgesUpsertResult, RetireEdgeIn, ValidatedEdgeIn, ValidatedEdgeOut
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/edges", tags=["edges"])


@router.get("", response_model=list[ValidatedEdgeOut], summary="Lister les Validated Edges")
async def get_edges(
    status_filter: str | None = Query(default="active", alias="status"),
    limit: int = Query(default=500, ge=1, le=2000),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(require_role(Role.pm, Role.risk, Role.analyst)),
) -> list[ValidatedEdgeOut]:
    if status_filter == "all":
        status_filter = None
    rows = await list_validated_edges(session, status=status_filter, limit=limit)
    return [ValidatedEdgeOut.model_validate(r) for r in rows]


@router.post(
    "",
    response_model=EdgesUpsertResult,
    summary="Upsert lot d'edges (idempotent fingerprint)",
)
async def push_edges(
    edges: list[ValidatedEdgeIn],
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> EdgesUpsertResult:
    if not edges:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lot vide.")
    if len(edges) > settings.max_ingest_batch:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Lot de {len(edges)} > max {settings.max_ingest_batch}.",
        )
    written = await upsert_validated_edges(session, edges)
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="edges.upsert",
        resource="validated_edges",
        details={"count": written, "fingerprints": [e.fingerprint for e in edges[:20]]},
    )
    return EdgesUpsertResult(received=len(edges), written=written)


@router.post(
    "/retire",
    response_model=dict,
    summary="Retirer un edge (status=retired)",
)
async def retire_edge(
    body: RetireEdgeIn,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> dict[str, bool | str]:
    fp = body.fingerprint.strip()
    if not fp:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "fingerprint requis")
    ok = await retire_validated_edge(session, fp)
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="edges.retire" if ok else "edges.retire.noop",
        resource=fp,
        details={"ok": ok},
    )
    return {"fingerprint": fp, "retired": ok}
