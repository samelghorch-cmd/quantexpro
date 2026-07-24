"""Accès aux données — écritures IDEMPOTENTES et lectures paginées.

Idempotence : chaque insertion utilise ``INSERT ... ON CONFLICT DO UPDATE`` sur la clé
naturelle (``symbol, ts`` pour les barres/orderbook ; ``symbol, ts, trade_id`` pour les
ticks). Rejouer un lot (retry du bus ZDL, reprise réseau) ne crée jamais de doublon et
converge vers la dernière valeur — propriété clé du Zero-Data-Loss.

Pagination : keyset (curseur) sur ``ts`` — stable et performant sur hypertable, sans OFFSET.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Bar1m, Bar5m, OrderbookL2Snapshot, Tick
from .schemas import BarIn, OrderbookL2In, TickIn, Timeframe

_BAR_MODEL: dict[Timeframe, type[Bar1m] | type[Bar5m]] = {
    Timeframe.m1: Bar1m,
    Timeframe.m5: Bar5m,
}


def bar_model(timeframe: Timeframe) -> type[Bar1m] | type[Bar5m]:
    return _BAR_MODEL[timeframe]


# ---- Écritures idempotentes -------------------------------------------------------


async def upsert_bars(session: AsyncSession, timeframe: Timeframe, bars: Sequence[BarIn]) -> int:
    """Insère/actualise un lot de barres. Retourne le nombre de lignes écrites."""
    if not bars:
        return 0
    model = bar_model(timeframe)
    rows = [
        {
            "symbol": b.symbol,
            "ts": b.ts,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
            "volume_buy": b.volume_buy,
        }
        for b in bars
    ]
    stmt = pg_insert(model).values(rows)
    # `excluded` et `set_` sont indexés par NOM de colonne DB (o/h/l/c/v/v_buy),
    # tandis que `values(...)` utilise les attributs ORM (open/high/...).
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol", "ts"],
        set_={
            "o": stmt.excluded.o,
            "h": stmt.excluded.h,
            "l": stmt.excluded.l,
            "c": stmt.excluded.c,
            "v": stmt.excluded.v,
            "v_buy": stmt.excluded.v_buy,
        },
    )
    result = await session.execute(stmt)
    return result.rowcount if result.rowcount is not None else len(rows)


async def upsert_ticks(session: AsyncSession, ticks: Sequence[TickIn]) -> int:
    if not ticks:
        return 0
    rows = [
        {
            "symbol": t.symbol,
            "ts": t.ts,
            "trade_id": t.trade_id,
            "price": t.price,
            "size": t.size,
            "side": t.side.value,
        }
        for t in ticks
    ]
    stmt = pg_insert(Tick).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol", "ts", "trade_id"],
        set_={
            "price": stmt.excluded.price,
            "size": stmt.excluded.size,
            "side": stmt.excluded.side,
        },
    )
    result = await session.execute(stmt)
    return result.rowcount if result.rowcount is not None else len(rows)


async def upsert_orderbook(
    session: AsyncSession, snapshots: Sequence[OrderbookL2In]
) -> int:
    if not snapshots:
        return 0
    rows = [
        {"symbol": s.symbol, "ts": s.ts, "bids": s.bids, "asks": s.asks}
        for s in snapshots
    ]
    stmt = pg_insert(OrderbookL2Snapshot).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol", "ts"],
        set_={"bids": stmt.excluded.bids, "asks": stmt.excluded.asks},
    )
    result = await session.execute(stmt)
    return result.rowcount if result.rowcount is not None else len(rows)


# ---- Lectures paginées (keyset) ---------------------------------------------------


async def read_bars(
    session: AsyncSession,
    timeframe: Timeframe,
    symbol: str,
    *,
    start: dt.datetime | None,
    end: dt.datetime | None,
    after: dt.datetime | None,
    limit: int,
) -> list[Bar1m | Bar5m]:
    """Lit les barres d'un symbole par ordre chronologique croissant.

    ``after`` : curseur keyset — ne renvoie que les barres strictement postérieures.
    """
    model = bar_model(timeframe)
    query = select(model).where(model.symbol == symbol)
    if start is not None:
        query = query.where(model.ts >= start)
    if end is not None:
        query = query.where(model.ts <= end)
    if after is not None:
        query = query.where(model.ts > after)
    query = query.order_by(model.ts.asc()).limit(limit)
    result = await session.execute(query)
    return list(result.scalars().all())
