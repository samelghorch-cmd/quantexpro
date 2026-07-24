"""Table validated_edges — Alpha Forge ZDL (P4-AF-SYNC).

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-24
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS validated_edges (
            fingerprint    VARCHAR(256) PRIMARY KEY,
            client_id      VARCHAR(64),
            name           VARCHAR(256) NOT NULL,
            strategy_id    INTEGER,
            symbol         VARCHAR(32),
            tf             VARCHAR(16),
            dossier_id     VARCHAR(64),
            verdict        VARCHAR(16) NOT NULL DEFAULT 'GO',
            score          DOUBLE PRECISION,
            letter         VARCHAR(2) NOT NULL,
            status         VARCHAR(16) NOT NULL DEFAULT 'active',
            metrics        JSONB,
            params         JSONB,
            tools_applied  JSONB,
            notes          VARCHAR(512),
            validated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_validated_edges_status ON validated_edges (status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_validated_edges_updated "
        "ON validated_edges (updated_at DESC);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS validated_edges;")
