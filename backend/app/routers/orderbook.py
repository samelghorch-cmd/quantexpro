"""Orderbook L2 — ingestion idempotente d'instantanés (POST)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import upsert_orderbook
from ..schemas import IngestResult, OrderbookL2In
from ..security import require_api_key

router = APIRouter(prefix="/v1/orderbook", tags=["orderbook"])


@router.post(
    "",
    response_model=IngestResult,
    status_code=status.HTTP_200_OK,
    summary="Ingestion idempotente d'instantanés de carnet L2",
)
async def ingest_orderbook(
    snapshots: list[OrderbookL2In],
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _identity: str = Depends(require_api_key),
) -> IngestResult:
    if not snapshots:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lot vide.")
    if len(snapshots) > settings.max_ingest_batch:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Lot de {len(snapshots)} > max {settings.max_ingest_batch} (backpressure).",
        )
    written = await upsert_orderbook(session, snapshots)
    return IngestResult(
        received=len(snapshots),
        written=written,
        symbol_count=len({s.symbol for s in snapshots}),
    )
