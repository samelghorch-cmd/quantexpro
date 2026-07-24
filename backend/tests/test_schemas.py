"""Tests de validation des schémas Pydantic v2 (frontière ZDL — rien d'invalide n'entre)."""

from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from app.schemas import BarIn, OrderbookL2In, Side, TickIn

UTC = dt.UTC


def _ts() -> dt.datetime:
    return dt.datetime(2026, 7, 24, 12, 0, tzinfo=UTC)


def test_bar_valid() -> None:
    bar = BarIn(
        symbol="BTCUSDT", ts=_ts(), open=100, high=110, low=95, close=105, volume=10, volume_buy=6
    )
    assert bar.symbol == "BTCUSDT"
    assert bar.ts.tzinfo is not None


def test_bar_rejects_naive_timestamp() -> None:
    with pytest.raises(ValidationError):
        BarIn(symbol="BTC", ts=dt.datetime(2026, 7, 24, 12, 0), open=1, high=1, low=1, close=1)


def test_bar_rejects_high_below_low() -> None:
    with pytest.raises(ValidationError):
        BarIn(symbol="BTC", ts=_ts(), open=100, high=90, low=95, close=92)


def test_bar_rejects_close_outside_range() -> None:
    with pytest.raises(ValidationError):
        BarIn(symbol="BTC", ts=_ts(), open=100, high=110, low=95, close=120)


def test_bar_rejects_volume_buy_gt_volume() -> None:
    with pytest.raises(ValidationError):
        BarIn(symbol="BTC", ts=_ts(), open=100, high=110, low=95, close=105, volume=5, volume_buy=6)


def test_bar_rejects_unknown_field() -> None:
    with pytest.raises(ValidationError):
        BarIn(symbol="BTC", ts=_ts(), open=1, high=1, low=1, close=1, foo=1)  # type: ignore[call-arg]


def test_tick_defaults_side_unknown() -> None:
    tick = TickIn(symbol="BTC", ts=_ts(), price=100, size=1)
    assert tick.side is Side.unknown
    assert tick.trade_id == ""


def test_orderbook_rejects_non_positive_price() -> None:
    with pytest.raises(ValidationError):
        OrderbookL2In(symbol="BTC", ts=_ts(), bids=[[0, 1]], asks=[[101, 1]])


def test_orderbook_valid() -> None:
    ob = OrderbookL2In(symbol="BTC", ts=_ts(), bids=[[100, 2]], asks=[[101, 3]])
    assert ob.bids == [[100, 2]]
    assert ob.asks == [[101, 3]]
