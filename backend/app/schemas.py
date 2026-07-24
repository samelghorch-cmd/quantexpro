"""Schémas Pydantic v2 — contrats d'API validés à la frontière (ZDL : rien d'invalide n'entre).

Ces schémas sont le pendant Python des payloads produits par le collector / dashboard JS.
Toute barre invalide (OHLC incohérent, volume négatif, timestamp naïf) est rejetée avant
d'atteindre la base.
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---- Types de base ---------------------------------------------------------------

Symbol = Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._/-]+$")]
Price = Annotated[float, Field(gt=0)]
NonNegFloat = Annotated[float, Field(ge=0)]


class Timeframe(StrEnum):
    m1 = "1m"
    m5 = "5m"


class Side(StrEnum):
    buy = "buy"
    sell = "sell"
    unknown = "unknown"


def _ensure_aware(value: dt.datetime) -> dt.datetime:
    """Refuse les datetimes naïfs (source n°1 de bugs de fuseau) et normalise en UTC."""
    if value.tzinfo is None:
        raise ValueError("timestamp doit être timezone-aware (UTC recommandé)")
    return value.astimezone(dt.UTC)


# ---- Barres ----------------------------------------------------------------------


class BarIn(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    symbol: Symbol
    ts: dt.datetime
    open: Price
    high: Price
    low: Price
    close: Price
    volume: NonNegFloat = 0.0
    volume_buy: NonNegFloat | None = None

    _v_ts = field_validator("ts")(_ensure_aware)

    @model_validator(mode="after")
    def _check_ohlc(self) -> BarIn:
        if self.high < self.low:
            raise ValueError(f"high ({self.high}) < low ({self.low})")
        if not (self.low <= self.open <= self.high):
            raise ValueError("open hors de [low, high]")
        if not (self.low <= self.close <= self.high):
            raise ValueError("close hors de [low, high]")
        if self.volume_buy is not None and self.volume_buy > self.volume:
            raise ValueError("volume_buy > volume")
        return self


class BarOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    ts: dt.datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    volume_buy: float | None = None


# ---- Ticks -----------------------------------------------------------------------


class TickIn(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    symbol: Symbol
    ts: dt.datetime
    trade_id: str = Field(default="", max_length=64)
    price: Price
    size: NonNegFloat
    side: Side = Side.unknown

    _v_ts = field_validator("ts")(_ensure_aware)


class TickOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    ts: dt.datetime
    trade_id: str
    price: float
    size: float
    side: str


# ---- Orderbook L2 ----------------------------------------------------------------

Level = Annotated[list[float], Field(min_length=2, max_length=2)]  # [price, size]


class OrderbookL2In(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    symbol: Symbol
    ts: dt.datetime
    bids: list[Level] = Field(min_length=1)
    asks: list[Level] = Field(min_length=1)

    _v_ts = field_validator("ts")(_ensure_aware)

    @field_validator("bids", "asks")
    @classmethod
    def _positive_levels(cls, levels: list[list[float]]) -> list[list[float]]:
        for price, size in levels:
            if price <= 0 or size < 0:
                raise ValueError("niveau L2 invalide (price>0, size>=0 requis)")
        return levels


class OrderbookL2Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    ts: dt.datetime
    bids: list[list[float]]
    asks: list[list[float]]


# ---- Réponses ---------------------------------------------------------------------


class IngestResult(BaseModel):
    """Résultat d'un lot d'ingestion idempotent."""

    received: int
    written: int  # lignes insérées ou mises à jour (upsert)
    symbol_count: int


class Page(BaseModel):
    """Enveloppe de pagination par curseur (keyset sur ``ts``)."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    items: list[Any]
    count: int
    next_cursor: str | None = None


class PromptRequest(BaseModel):
    """Requête de génération de stratégie par prompt (LLM local)."""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=3, max_length=4000)
    name: str | None = Field(default=None, max_length=80)


class StrategyResponse(BaseModel):
    """Stratégie générée, prête à importer dans le Rule Builder."""

    strategy: dict[str, Any]
    source: str


# ---- Pont MT5 --------------------------------------------------------------------


class MT5Side(StrEnum):
    buy = "buy"
    sell = "sell"
    close = "close"


class MT5OrderType(StrEnum):
    market = "market"
    limit = "limit"


class MT5Mode(StrEnum):
    paper = "paper"
    demo = "demo"
    live = "live"


class MT5ExecStatus(StrEnum):
    filled = "filled"
    rejected = "rejected"


class SignalIn(BaseModel):
    """Signal de trading soumis au pont MT5 (idempotent via ``client_order_id``)."""

    model_config = ConfigDict(extra="forbid")

    client_order_id: str = Field(min_length=1, max_length=64)
    symbol: Symbol
    side: MT5Side
    volume: float = Field(gt=0)
    order_type: MT5OrderType = MT5OrderType.market
    price: Price | None = None
    sl: Price | None = None
    tp: Price | None = None
    mode: MT5Mode | None = None
    strategy_id: int | None = None
    comment: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _limit_needs_price(self) -> SignalIn:
        if self.order_type is MT5OrderType.limit and self.price is None:
            raise ValueError("un ordre 'limit' exige un 'price'")
        return self


class SignalAck(BaseModel):
    client_order_id: str
    status: str
    mode: str


class PendingSignal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_order_id: str
    symbol: str
    side: str
    order_type: str
    volume: float
    price: float | None = None
    sl: float | None = None
    tp: float | None = None
    mode: str
    comment: str | None = None


class ExecutionIn(BaseModel):
    """Acquittement d'exécution renvoyé par l'EA MT5."""

    model_config = ConfigDict(extra="forbid")

    client_order_id: str = Field(min_length=1, max_length=64)
    status: MT5ExecStatus
    ticket: int | None = None
    filled_price: float | None = Field(default=None, gt=0)
    reject_reason: str | None = Field(default=None, max_length=255)


class ExecutionResult(BaseModel):
    client_order_id: str
    status: str


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ts: dt.datetime
    actor: str
    role: str
    action: str
    resource: str
    payload_hash: str
    details: dict[str, Any] | None = None
