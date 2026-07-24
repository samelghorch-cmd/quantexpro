"""Modèles ORM SQLAlchemy 2.0 (typés) — miroir des hypertables TimescaleDB.

Tables (partitionnées par temps en hypertables, cf. migration Alembic 0001) :
  • ticks                     : flux tick-by-tick (idempotence par trade_id)
  • bars_1m / bars_5m         : barres OHLCV agrégées
  • orderbook_l2_snapshots    : instantanés du carnet L2 (bids/asks en JSONB)

Contrainte TimescaleDB : toute clé primaire / unique DOIT inclure la colonne de temps
partitionnante (``ts``) — respecté ci-dessous.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Float, Index, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base déclarative commune."""


class _OHLCVMixin:
    """Colonnes OHLCV partagées par toutes les tables de barres."""

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    ts: Mapped[dt.datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    open: Mapped[float] = mapped_column("o", Float, nullable=False)
    high: Mapped[float] = mapped_column("h", Float, nullable=False)
    low: Mapped[float] = mapped_column("l", Float, nullable=False)
    close: Mapped[float] = mapped_column("c", Float, nullable=False)
    volume: Mapped[float] = mapped_column("v", Float, nullable=False, default=0.0)
    # Volume acheteur agressif RÉEL (ex. taker-buy Binance) — sert au VPIN causal.
    volume_buy: Mapped[float | None] = mapped_column("v_buy", Float, nullable=True)
    ingested_at: Mapped[dt.datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )


class Bar1m(_OHLCVMixin, Base):
    __tablename__ = "bars_1m"
    __table_args__ = (
        PrimaryKeyConstraint("symbol", "ts", name="pk_bars_1m"),
        Index("ix_bars_1m_symbol_ts", "symbol", "ts"),
    )


class Bar5m(_OHLCVMixin, Base):
    __tablename__ = "bars_5m"
    __table_args__ = (
        PrimaryKeyConstraint("symbol", "ts", name="pk_bars_5m"),
        Index("ix_bars_5m_symbol_ts", "symbol", "ts"),
    )


class Tick(Base):
    __tablename__ = "ticks"
    __table_args__ = (
        # Idempotence : un tick est identifié par (symbol, ts, trade_id).
        PrimaryKeyConstraint("symbol", "ts", "trade_id", name="pk_ticks"),
        Index("ix_ticks_symbol_ts", "symbol", "ts"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    ts: Mapped[dt.datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    trade_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    price: Mapped[float] = mapped_column(Float, nullable=False)
    size: Mapped[float] = mapped_column(Float, nullable=False)
    # "buy" | "sell" | "unknown" — côté agresseur si connu.
    side: Mapped[str] = mapped_column(String(8), nullable=False, default="unknown")
    ingested_at: Mapped[dt.datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )


class OrderbookL2Snapshot(Base):
    __tablename__ = "orderbook_l2_snapshots"
    __table_args__ = (
        PrimaryKeyConstraint("symbol", "ts", name="pk_orderbook_l2"),
        Index("ix_orderbook_l2_symbol_ts", "symbol", "ts"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    ts: Mapped[dt.datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    # bids / asks : liste ordonnée de paires [price, size], stockée en JSONB.
    bids: Mapped[list] = mapped_column(JSONB, nullable=False)
    asks: Mapped[list] = mapped_column(JSONB, nullable=False)
    ingested_at: Mapped[dt.datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )
