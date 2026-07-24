"""Gouvernance & exécution : audit_events (append-only) + mt5_orders.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-24
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_events (
            id            BIGSERIAL     PRIMARY KEY,
            ts            TIMESTAMPTZ   NOT NULL DEFAULT now(),
            actor         VARCHAR(64)   NOT NULL,
            role          VARCHAR(16)   NOT NULL,
            action        VARCHAR(64)   NOT NULL,
            resource      VARCHAR(128)  NOT NULL,
            payload_hash  VARCHAR(64)   NOT NULL,
            details       JSONB
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_ts ON audit_events (ts DESC);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS mt5_orders (
            client_order_id VARCHAR(64)      PRIMARY KEY,
            symbol          VARCHAR(32)      NOT NULL,
            side            VARCHAR(8)       NOT NULL,
            order_type      VARCHAR(8)       NOT NULL,
            volume          DOUBLE PRECISION NOT NULL,
            price           DOUBLE PRECISION,
            sl              DOUBLE PRECISION,
            tp              DOUBLE PRECISION,
            mode            VARCHAR(8)       NOT NULL,
            status          VARCHAR(12)      NOT NULL DEFAULT 'pending',
            strategy_id     INTEGER,
            comment         VARCHAR(64),
            ticket          BIGINT,
            filled_price    DOUBLE PRECISION,
            filled_at       TIMESTAMPTZ,
            reject_reason   VARCHAR(255),
            created_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ      NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_mt5_orders_status_mode ON mt5_orders (status, mode);"
    )

    # Append-only : bloque UPDATE/DELETE sur le journal d'audit au niveau base.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_events_no_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events est append-only (ni UPDATE ni DELETE)';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_audit_events_no_mutation ON audit_events;")
    op.execute(
        """
        CREATE TRIGGER trg_audit_events_no_mutation
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_no_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_events_no_mutation ON audit_events;")
    op.execute("DROP FUNCTION IF EXISTS audit_events_no_mutation();")
    op.execute("DROP TABLE IF EXISTS mt5_orders;")
    op.execute("DROP TABLE IF EXISTS audit_events;")
