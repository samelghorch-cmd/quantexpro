"""Barres OHLCV — ingestion idempotente (POST) et lecture paginée (GET)."""

from __future__ import annotations

import datetime as dt
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..bus import bars_stream, get_bus, make_bar_closed
from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import read_bars, upsert_bars
from ..schemas import BarIn, BarOut, IngestResult, Page, Timeframe
from ..security import require_api_key

router = APIRouter(prefix="/v1/bars", tags=["bars"])
_logger = logging.getLogger(__name__)


async def _publish_bar_events(timeframe: Timeframe, bars: list[BarIn]) -> None:
    """Publie les bar-close sur le bus (best-effort : la base TS reste la source de vérité)."""
    stream = bars_stream(str(timeframe))
    bus = get_bus()
    try:
        for bar in bars:
            await bus.publish(stream, make_bar_closed(bar.symbol, str(timeframe), bar.model_dump()))
    except Exception:  # noqa: BLE001 - un bus indisponible ne doit pas faire échouer l'ingestion
        _logger.exception("bus_publish_failed", extra={"stream": stream, "count": len(bars)})


@router.post(
    "/{timeframe}",
    response_model=IngestResult,
    status_code=status.HTTP_200_OK,
    summary="Ingestion idempotente d'un lot de barres",
)
async def ingest_bars(
    timeframe: Timeframe,
    bars: list[BarIn],
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _identity: str = Depends(require_api_key),
) -> IngestResult:
    if not bars:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lot vide.")
    if len(bars) > settings.max_ingest_batch:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Lot de {len(bars)} > max {settings.max_ingest_batch} (backpressure).",
        )
    written = await upsert_bars(session, timeframe, bars)
    if settings.bus_enabled:
        await _publish_bar_events(timeframe, bars)
    return IngestResult(
        received=len(bars),
        written=written,
        symbol_count=len({b.symbol for b in bars}),
    )


@router.get(
    "/{symbol}",
    response_model=Page,
    summary="Lecture paginée (keyset) des barres d'un symbole",
)
async def list_bars(
    symbol: str,
    timeframe: Timeframe = Query(default=Timeframe.m1),
    start: dt.datetime | None = Query(default=None),
    end: dt.datetime | None = Query(default=None),
    cursor: dt.datetime | None = Query(
        default=None, description="Curseur keyset : renvoie les barres après ce timestamp."
    ),
    limit: int | None = Query(default=None, ge=1),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _identity: str = Depends(require_api_key),
) -> Page:
    effective_limit = min(limit or settings.default_page_limit, settings.max_page_limit)
    rows = await read_bars(
        session,
        timeframe,
        symbol,
        start=start,
        end=end,
        after=cursor,
        limit=effective_limit,
    )
    items = [BarOut.model_validate(r) for r in rows]
    # Curseur suivant : dernier ts renvoyé, uniquement si la page est pleine.
    next_cursor = (
        items[-1].ts.isoformat() if len(items) == effective_limit and items else None
    )
    return Page(items=items, count=len(items), next_cursor=next_cursor)
