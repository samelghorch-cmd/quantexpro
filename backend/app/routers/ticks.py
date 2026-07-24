"""Ticks — ingestion idempotente (POST)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import upsert_ticks
from ..schemas import IngestResult, TickIn
from ..security import require_api_key

router = APIRouter(prefix="/v1/ticks", tags=["ticks"])


@router.post(
    "",
    response_model=IngestResult,
    status_code=status.HTTP_200_OK,
    summary="Ingestion idempotente d'un lot de ticks",
)
async def ingest_ticks(
    ticks: list[TickIn],
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _identity: str = Depends(require_api_key),
) -> IngestResult:
    if not ticks:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lot vide.")
    if len(ticks) > settings.max_ingest_batch:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Lot de {len(ticks)} > max {settings.max_ingest_batch} (backpressure).",
        )
    written = await upsert_ticks(session, ticks)
    return IngestResult(
        received=len(ticks),
        written=written,
        symbol_count=len({t.symbol for t in ticks}),
    )
