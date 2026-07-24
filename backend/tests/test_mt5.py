"""Tests du pont MT5 — schémas + idempotence SQL (sans base réelle)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.repositories import apply_execution, create_signal
from app.schemas import ExecutionIn, MT5ExecStatus, MT5OrderType, SignalIn


def test_valid_market_signal() -> None:
    s = SignalIn(client_order_id="c1", symbol="BTCUSDT", side="buy", volume=0.1)
    assert s.order_type is MT5OrderType.market


def test_limit_requires_price() -> None:
    with pytest.raises(ValidationError):
        SignalIn(client_order_id="c1", symbol="BTC", side="buy", volume=0.1, order_type="limit")


def test_limit_with_price_ok() -> None:
    s = SignalIn(
        client_order_id="c", symbol="BTC", side="sell", volume=1, order_type="limit", price=100
    )
    assert s.price == 100


def test_volume_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        SignalIn(client_order_id="c", symbol="BTC", side="buy", volume=0)


def test_execution_schema() -> None:
    e = ExecutionIn(client_order_id="c", status="filled", ticket=5, filled_price=100.5)
    assert e.status is MT5ExecStatus.filled


class _FakeResult:
    rowcount = 1


class _CapturingSession:
    def __init__(self) -> None:
        self.last_stmt = None

    async def execute(self, stmt):  # noqa: ANN001 - test double
        self.last_stmt = stmt
        return _FakeResult()


def _sql(stmt) -> str:  # noqa: ANN001
    return str(stmt.compile(dialect=postgresql.dialect())).lower()


@pytest.mark.asyncio
async def test_create_signal_is_idempotent_sql() -> None:
    session = _CapturingSession()
    created = await create_signal(
        session, SignalIn(client_order_id="c", symbol="BTC", side="buy", volume=1), "demo"
    )  # type: ignore[arg-type]
    sql = _sql(session.last_stmt)
    assert "insert into mt5_orders" in sql
    assert "on conflict" in sql
    assert "do nothing" in sql
    assert created is True


@pytest.mark.asyncio
async def test_apply_execution_updates_pending_only() -> None:
    session = _CapturingSession()
    await apply_execution(
        session, ExecutionIn(client_order_id="c", status="filled", ticket=1, filled_price=10)
    )  # type: ignore[arg-type]
    sql = _sql(session.last_stmt)
    assert "update mt5_orders set" in sql
    assert "where" in sql
