"""Tests du schéma de stratégie — parité stricte avec validateRules (JS)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.llm.rules import RuleCondition, StrategyDraft


def test_valid_strategy() -> None:
    draft = StrategyDraft.model_validate(
        {
            "name": "EMA cross",
            "rules": {
                "long": [{"left": "ema20", "op": "crossUp", "right": "ema50"}],
                "short": [{"left": "ema20", "op": "crossDn", "right": "ema50"}],
            },
        }
    )
    assert draft.name == "EMA cross"
    assert draft.rules.long[0].op == "crossUp"


def test_unknown_source_rejected() -> None:
    with pytest.raises(ValidationError):
        RuleCondition(left="ema999", op="gt", right="close")


def test_unknown_op_rejected() -> None:
    with pytest.raises(ValidationError):
        RuleCondition(left="close", op="above", right="ema20")


def test_const_requires_right_const() -> None:
    with pytest.raises(ValidationError):
        RuleCondition(left="rsi14", op="lt", right="const")  # rightConst manquant


def test_const_value_kept() -> None:
    cond = RuleCondition(left="rsi14", op="lt", right="const", rightConst=70)
    assert cond.rightConst == 70


def test_right_const_dropped_when_not_const() -> None:
    # rightConst fourni mais right != const → normalisé à None (comme validateRules).
    cond = RuleCondition(left="ema20", op="gt", right="ema50", rightConst=5)
    assert cond.rightConst is None


def test_empty_rules_rejected() -> None:
    with pytest.raises(ValidationError):
        StrategyDraft.model_validate({"name": "vide", "rules": {"long": [], "short": []}})


def test_extra_field_forbidden() -> None:
    with pytest.raises(ValidationError):
        RuleCondition(left="close", op="gt", right="ema20", foo=1)  # type: ignore[call-arg]
