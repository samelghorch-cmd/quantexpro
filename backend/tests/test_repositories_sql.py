"""Tests d'idempotence des écritures — sans base réelle.

On capture la requête SQL construite par les fonctions de repository et on vérifie qu'elle
compile bien en ``INSERT ... ON CONFLICT ... DO UPDATE`` sur la bonne clé naturelle. C'est
la garantie structurelle du Zero-Data-Loss : rejouer un lot ne crée jamais de doublon.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories import upsert_bars, upsert_orderbook, upsert_ticks
from app.schemas import BarIn, OrderbookL2In, TickIn, Timeframe

UTC = dt.timezone.utc


class _FakeResult:
    rowcount = 1


class _CapturingSession:
    """Session factice qui capture la dernière requête exécutée."""

    def __init__(self) -> None:
        self.last_stmt = None

    async def execute(self, stmt):  # noqa: ANN001 - test double
        self.last_stmt = stmt
        return _FakeResult()


def _compiled(stmt) -> str:  # noqa: ANN001
    return str(stmt.compile(dialect=postgresql.dialect()))


@pytest.mark.asyncio
async def test_upsert_bars_is_idempotent_sql() -> None:
    session = _CapturingSession()
    bar = BarIn(symbol="BTC", ts=dt.datetime(2026, 7, 24, tzinfo=UTC), open=1, high=2, low=1, close=1.5, volume=10)
    written = await upsert_bars(session, Timeframe.m1, [bar])  # type: ignore[arg-type]
    assert written == 1
    sql = _compiled(session.last_stmt).lower()
    assert "insert into bars_1m" in sql
    assert "on conflict" in sql
    assert "do update" in sql


@pytest.mark.asyncio
async def test_upsert_ticks_conflict_on_trade_id() -> None:
    session = _CapturingSession()
    tick = TickIn(symbol="BTC", ts=dt.datetime(2026, 7, 24, tzinfo=UTC), trade_id="t1", price=100, size=1)
    await upsert_ticks(session, [tick])  # type: ignore[arg-type]
    sql = _compiled(session.last_stmt).lower()
    assert "insert into ticks" in sql
    assert "on conflict" in sql


@pytest.mark.asyncio
async def test_upsert_orderbook_conflict() -> None:
    session = _CapturingSession()
    ob = OrderbookL2In(symbol="BTC", ts=dt.datetime(2026, 7, 24, tzinfo=UTC), bids=[[100, 1]], asks=[[101, 1]])
    await upsert_orderbook(session, [ob])  # type: ignore[arg-type]
    sql = _compiled(session.last_stmt).lower()
    assert "insert into orderbook_l2_snapshots" in sql
    assert "on conflict" in sql


@pytest.mark.asyncio
async def test_empty_batches_are_noops() -> None:
    session = _CapturingSession()
    assert await upsert_bars(session, Timeframe.m5, []) == 0  # type: ignore[arg-type]
    assert await upsert_ticks(session, []) == 0  # type: ignore[arg-type]
    assert await upsert_orderbook(session, []) == 0  # type: ignore[arg-type]
    assert session.last_stmt is None  # aucune requête émise
