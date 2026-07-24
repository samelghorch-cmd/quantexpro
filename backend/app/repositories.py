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
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    AuditEvent,
    Bar1d,
    Bar1h,
    Bar1m,
    Bar4h,
    Bar5m,
    Bar15m,
    MT5Order,
    OrderbookL2Snapshot,
    Tick,
)
from .schemas import BarIn, ExecutionIn, OrderbookL2In, SignalIn, TickIn, Timeframe

_BAR_MODEL: dict[Timeframe, type] = {
    Timeframe.m1: Bar1m,
    Timeframe.m5: Bar5m,
    Timeframe.m15: Bar15m,
    Timeframe.h1: Bar1h,
    Timeframe.h4: Bar4h,
    Timeframe.d1: Bar1d,
}


def bar_model(timeframe: Timeframe) -> type:
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
    await session.execute(stmt)
    # ON CONFLICT DO UPDATE affecte chaque ligne du lot → toutes sont écrites.
    return len(rows)


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
    await session.execute(stmt)
    return len(rows)


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
    await session.execute(stmt)
    return len(rows)


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
    return cast("list[Bar1m | Bar5m]", list(result.scalars().all()))


# ---- Pont MT5 ---------------------------------------------------------------------


async def create_signal(session: AsyncSession, signal: SignalIn, mode: str) -> bool:
    """Crée un signal (idempotent sur ``client_order_id``). Retourne True si nouvellement créé."""
    row = {
        "client_order_id": signal.client_order_id,
        "symbol": signal.symbol,
        "side": signal.side.value,
        "order_type": signal.order_type.value,
        "volume": signal.volume,
        "price": signal.price,
        "sl": signal.sl,
        "tp": signal.tp,
        "mode": mode,
        "status": "pending",
        "strategy_id": signal.strategy_id,
        "comment": signal.comment,
    }
    stmt = pg_insert(MT5Order).values(row).on_conflict_do_nothing(
        index_elements=["client_order_id"]
    )
    result = await session.execute(stmt)
    return bool((getattr(result, "rowcount", 0) or 0) > 0)


async def list_pending_signals(session: AsyncSession, mode: str, limit: int) -> list[MT5Order]:
    query = (
        select(MT5Order)
        .where(MT5Order.status == "pending", MT5Order.mode == mode)
        .order_by(MT5Order.created_at.asc())
        .limit(limit)
    )
    result = await session.execute(query)
    return list(result.scalars().all())


async def apply_execution(session: AsyncSession, execution: ExecutionIn) -> bool:
    """Applique un ACK d'exécution à un ordre 'pending'. Retourne True si un ordre a été modifié."""
    new_status = "filled" if execution.status.value == "filled" else "rejected"
    values: dict[str, object] = {
        "status": new_status,
        "ticket": execution.ticket,
        "filled_price": execution.filled_price,
        "reject_reason": execution.reject_reason,
        "updated_at": dt.datetime.now(dt.UTC),
    }
    if new_status == "filled":
        values["filled_at"] = dt.datetime.now(dt.UTC)
    stmt = (
        update(MT5Order)
        .where(MT5Order.client_order_id == execution.client_order_id)
        .where(MT5Order.status == "pending")
        .values(**values)
    )
    result = await session.execute(stmt)
    return bool((getattr(result, "rowcount", 0) or 0) > 0)


async def list_audit(
    session: AsyncSession, *, limit: int, after_id: int | None
) -> list[AuditEvent]:
    query = select(AuditEvent)
    if after_id is not None:
        query = query.where(AuditEvent.id > after_id)
    query = query.order_by(AuditEvent.id.asc()).limit(limit)
    result = await session.execute(query)
    return list(result.scalars().all())
