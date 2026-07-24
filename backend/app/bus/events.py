"""Événements du bus — enveloppe typée + idempotence.

Chaque message porte une clé ``id`` déterministe (``symbol:timeframe:ts`` pour un bar-close),
ce qui permet aux consommateurs d'être idempotents (dédup sur rejeu / redelivery).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

BAR_CLOSED = "bar.closed"


def _uuid() -> str:
    return uuid.uuid4().hex


class EventEnvelope(BaseModel):
    """Enveloppe générique transportée dans un Redis Stream."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=_uuid)  # clé d'idempotence
    type: str
    ts: dt.datetime
    payload: dict[str, Any]

    def to_fields(self) -> dict[str, str]:
        """Sérialise en champs plats Redis (un seul champ JSON, robuste)."""
        return {"data": self.model_dump_json()}

    @classmethod
    def from_fields(cls, fields: dict[str, str]) -> EventEnvelope:
        """Reconstruit depuis les champs Redis (lève si ``data`` absent/invalide)."""
        raw = fields.get("data")
        if raw is None:
            raise ValueError("champ 'data' manquant dans le message")
        return cls.model_validate_json(raw)


def bars_stream(timeframe: str) -> str:
    """Nom du stream pour un timeframe donné (ex. ``bars.1m``)."""
    return f"bars.{timeframe}"


def make_bar_closed(symbol: str, timeframe: str, bar: dict[str, Any]) -> EventEnvelope:
    """Construit un événement ``bar.closed`` idempotent à partir d'une barre (dict BarOut)."""
    ts = bar["ts"]
    ts_key = ts.isoformat() if isinstance(ts, dt.datetime) else str(ts)
    event_ts = ts if isinstance(ts, dt.datetime) else dt.datetime.now(dt.UTC)
    return EventEnvelope(
        id=f"{symbol}:{timeframe}:{ts_key}",
        type=BAR_CLOSED,
        ts=event_ts,
        payload={"symbol": symbol, "timeframe": timeframe, **bar},
    )
