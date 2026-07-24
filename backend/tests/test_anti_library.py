"""Tests Anti-Library ZDL — schémas + SQL upsert."""

from __future__ import annotations

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories import deactivate_anti_entry, upsert_anti_library
from app.schemas import AntiLibraryIn


def test_anti_schema() -> None:
    e = AntiLibraryIn(concept_id="zscore_mr", label="Z-Score MR", strategy_ids=[21])
    assert e.concept_id == "zscore_mr"
    assert e.active is True


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
async def test_upsert_anti_on_conflict() -> None:
    session = _CapturingSession()
    n = await upsert_anti_library(
        session,  # type: ignore[arg-type]
        [AntiLibraryIn(concept_id="x", label="X", name_pattern="foo")],
    )
    assert n == 1
    sql = _sql(session.last_stmt)
    assert "insert into anti_library" in sql
    assert "on conflict" in sql


@pytest.mark.asyncio
async def test_deactivate_anti_sql() -> None:
    session = _CapturingSession()
    ok = await deactivate_anti_entry(session, "x")  # type: ignore[arg-type]
    assert ok is True
    sql = _sql(session.last_stmt)
    assert "update anti_library" in sql
    assert "active" in sql
