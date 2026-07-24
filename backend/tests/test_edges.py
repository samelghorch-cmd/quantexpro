"""Tests Validated Edges — schémas + SQL upsert (sans DB réelle)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.repositories import retire_validated_edge, upsert_validated_edges
from app.schemas import ValidatedEdgeIn


def test_edge_requires_go_and_letter() -> None:
    e = ValidatedEdgeIn(
        fingerprint="1::BTC::15m::x",
        name="ORB",
        letter="A",
        verdict="GO",
    )
    assert e.letter == "A"
    with pytest.raises(ValidationError):
        ValidatedEdgeIn(fingerprint="f", name="x", letter="D", verdict="GO")
    with pytest.raises(ValidationError):
        ValidatedEdgeIn(fingerprint="f", name="x", letter="A", verdict="REWORK")


class _FakeResult:
    rowcount = 1


class _CapturingSession:
    def __init__(self) -> None:
        self.last_stmt = None

    async def execute(self, stmt):  # noqa: ANN001
        self.last_stmt = stmt
        return _FakeResult()


def _sql(stmt) -> str:  # noqa: ANN001
    return str(stmt.compile(dialect=postgresql.dialect())).lower()


@pytest.mark.asyncio
async def test_upsert_edges_on_conflict() -> None:
    session = _CapturingSession()
    n = await upsert_validated_edges(
        session,  # type: ignore[arg-type]
        [
            ValidatedEdgeIn(
                fingerprint="fp1",
                name="Edge1",
                letter="B",
                verdict="GO",
                strategy_id=10,
            )
        ],
    )
    assert n == 1
    sql = _sql(session.last_stmt)
    assert "insert into validated_edges" in sql
    assert "on conflict" in sql


@pytest.mark.asyncio
async def test_retire_edge_sql() -> None:
    session = _CapturingSession()
    ok = await retire_validated_edge(session, "fp1")  # type: ignore[arg-type]
    assert ok is True
    sql = _sql(session.last_stmt)
    assert "update validated_edges" in sql
    assert "status" in sql
    assert "fingerprint" in sql
