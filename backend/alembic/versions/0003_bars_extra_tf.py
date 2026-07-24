"""Tables barres TF dashboard : 15m / 1h / 4h / 1d (P3-ZDL-SYNC).

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-24
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_HYPERTABLES = {
    "bars_15m": "30 days",
    "bars_1h": "90 days",
    "bars_4h": "180 days",
    "bars_1d": "365 days",
}


def _try_hypertable(table: str, chunk: str) -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable('{table}', 'ts',
                    chunk_time_interval => INTERVAL '{chunk}',
                    if_not_exists => TRUE);
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    for tf in ("15m", "1h", "4h", "1d"):
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
        _try_hypertable(table, _HYPERTABLES[table])
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_symbol_ts ON {table} (symbol, ts DESC);")


def downgrade() -> None:
    for tf in ("1d", "4h", "1h", "15m"):
        op.execute(f"DROP TABLE IF EXISTS bars_{tf};")
