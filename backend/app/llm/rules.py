"""Schéma de stratégie — MIROIR strict de `src/engine/ruleBuilder.js` + `validateRules`.

Toute stratégie produite par le LLM est validée ici avec EXACTEMENT les mêmes règles que
côté JS (mêmes sources, mêmes opérateurs, même contrainte `rightConst`). Une stratégie qui
passe cette validation passera `validateRules` dans l'Importer / Core Mode → parité garantie.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# Sources et opérateurs — doivent rester synchronisés avec RULE_SOURCES / RULE_OPS (JS).
SOURCE_IDS: frozenset[str] = frozenset(
    {
        "close", "open", "ema20", "ema50", "ema200", "sma20", "rsi14", "rsi2",
        "vwap", "adx14", "atr14", "macd", "macdSig", "bbUp", "bbLo", "const",
    }
)
OP_IDS: frozenset[str] = frozenset({"gt", "lt", "crossUp", "crossDn"})


class RuleCondition(BaseModel):
    """Une condition : ``{ left, op, right, rightConst? }`` (AND avec les autres du même côté)."""

    model_config = ConfigDict(extra="forbid")

    left: str
    op: str
    right: str
    rightConst: float | None = None

    @field_validator("left", "right")
    @classmethod
    def _known_source(cls, v: str) -> str:
        if v not in SOURCE_IDS:
            raise ValueError(f"source inconnue '{v}' — valides : {', '.join(sorted(SOURCE_IDS))}")
        return v

    @field_validator("op")
    @classmethod
    def _known_op(cls, v: str) -> str:
        if v not in OP_IDS:
            raise ValueError(f"opérateur inconnu '{v}' — valides : {', '.join(sorted(OP_IDS))}")
        return v

    @model_validator(mode="after")
    def _check_const(self) -> RuleCondition:
        if self.right == "const":
            if self.rightConst is None or not math.isfinite(self.rightConst):
                raise ValueError("'rightConst' doit être un nombre fini quand right = 'const'")
        else:
            self.rightConst = None  # normalisation : pas de constante hors right='const'
        return self


class StrategyRules(BaseModel):
    """Règles LONG / SHORT (AND sur chaque côté)."""

    model_config = ConfigDict(extra="forbid")

    long: list[RuleCondition] = []
    short: list[RuleCondition] = []

    @model_validator(mode="after")
    def _non_empty(self) -> StrategyRules:
        if not self.long and not self.short:
            raise ValueError("au moins une condition LONG ou SHORT est requise")
        return self


class StrategyDraft(BaseModel):
    """Stratégie prête à importer : ``{ name, rules }``."""

    model_config = ConfigDict(extra="forbid")

    name: str
    rules: StrategyRules

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        name = v.strip()
        if not name:
            raise ValueError("'name' ne peut pas être vide")
        return name[:80]
