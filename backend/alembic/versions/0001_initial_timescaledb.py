"""Schéma initial TimescaleDB : ticks, bars_1m, bars_5m, orderbook_l2_snapshots.

Revision ID: 0001
Revises:
Create Date: 2026-07-24
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extension TimescaleDB (image timescale/timescaledb).
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")

    # --- bars_1m / bars_5m -------------------------------------------------------
    for tf in ("1m", "5m"):
        table = f"bars_{tf}"
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table} (
                symbol       VARCHAR(32)               NOT NULL,
                ts           TIMESTAMPTZ               NOT NULL,
                o            DOUBLE PRECISION          NOT NULL,
                h            DOUBLE PRECISION          NOT NULL,
                l            DOUBLE PRECISION          NOT NULL,
                c            DOUBLE PRECISION          NOT NULL,
                v            DOUBLE PRECISION          NOT NULL DEFAULT 0,
                v_buy        DOUBLE PRECISION,
                ingested_at  TIMESTAMPTZ               NOT NULL DEFAULT now(),
                CONSTRAINT pk_{table} PRIMARY KEY (symbol, ts)
            );
            """
        )
        op.execute(
            f"SELECT create_hypertable('{table}', 'ts', "
            "chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);"
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_symbol_ts ON {table} (symbol, ts DESC);")

    # --- ticks -------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ticks (
            symbol       VARCHAR(32)      NOT NULL,
            ts           TIMESTAMPTZ      NOT NULL,
            trade_id     VARCHAR(64)      NOT NULL DEFAULT '',
            price        DOUBLE PRECISION NOT NULL,
            size         DOUBLE PRECISION NOT NULL,
            side         VARCHAR(8)       NOT NULL DEFAULT 'unknown',
            ingested_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
            CONSTRAINT pk_ticks PRIMARY KEY (symbol, ts, trade_id)
        );
        """
    )
    op.execute(
        "SELECT create_hypertable('ticks', 'ts', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ticks_symbol_ts ON ticks (symbol, ts DESC);")

    # --- orderbook_l2_snapshots --------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS orderbook_l2_snapshots (
            symbol       VARCHAR(32)  NOT NULL,
            ts           TIMESTAMPTZ  NOT NULL,
            bids         JSONB        NOT NULL,
            asks         JSONB        NOT NULL,
            ingested_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT pk_orderbook_l2 PRIMARY KEY (symbol, ts)
        );
        """
    )
    op.execute(
        "SELECT create_hypertable('orderbook_l2_snapshots', 'ts', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_orderbook_l2_symbol_ts "
        "ON orderbook_l2_snapshots (symbol, ts DESC);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS orderbook_l2_snapshots;")
    op.execute("DROP TABLE IF EXISTS ticks;")
    op.execute("DROP TABLE IF EXISTS bars_5m;")
    op.execute("DROP TABLE IF EXISTS bars_1m;")
