"""Tests du service prompt → stratégie, avec un faux client LLM (aucun modèle requis)."""

from __future__ import annotations

import pytest

from app.llm.errors import LLMInvalidOutput, LLMUnavailable
from app.llm.service import compile_strategy

VALID_JSON = (
    '{"name":"EMA","rules":{"long":[{"left":"ema20","op":"crossUp","right":"ema50"}],"short":[]}}'
)


class FakeClient:
    def __init__(self, response: str | None = None, exc: Exception | None = None) -> None:
        self._response = response
        self._exc = exc
        self.calls = 0

    async def complete(self, system: str, user: str) -> str:
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        assert self._response is not None
        return self._response


@pytest.mark.asyncio
async def test_compile_valid_json() -> None:
    draft = await compile_strategy("ema20 croise ema50", client=FakeClient(VALID_JSON))
    assert draft.name == "EMA"
    assert draft.rules.long[0].right == "ema50"


@pytest.mark.asyncio
async def test_compile_strips_markdown_fence() -> None:
    fenced = f"```json\n{VALID_JSON}\n```"
    draft = await compile_strategy("x", client=FakeClient(fenced))
    assert draft.rules.long[0].left == "ema20"


@pytest.mark.asyncio
async def test_compile_extracts_from_prose() -> None:
    prose = f"Voici la stratégie demandée :\n{VALID_JSON}\nVoilà."
    draft = await compile_strategy("x", client=FakeClient(prose))
    assert draft.name == "EMA"


@pytest.mark.asyncio
async def test_name_override_applied() -> None:
    no_name = '{"rules":{"long":[{"left":"close","op":"gt","right":"ema200"}],"short":[]}}'
    draft = await compile_strategy("x", name="Mon nom", client=FakeClient(no_name))
    assert draft.name == "Mon nom"


@pytest.mark.asyncio
async def test_invalid_json_raises() -> None:
    with pytest.raises(LLMInvalidOutput):
        await compile_strategy("x", client=FakeClient("pas du json du tout"))


@pytest.mark.asyncio
async def test_schema_violation_raises() -> None:
    bad = '{"name":"x","rules":{"long":[{"left":"ema20","op":"ABOVE","right":"ema50"}],"short":[]}}'
    with pytest.raises(LLMInvalidOutput):
        await compile_strategy("x", client=FakeClient(bad))


@pytest.mark.asyncio
async def test_unavailable_propagates() -> None:
    with pytest.raises(LLMUnavailable):
        await compile_strategy("x", client=FakeClient(exc=LLMUnavailable("down")))
