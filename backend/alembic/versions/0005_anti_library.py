"""Table anti_library — concepts involutifs ZDL (P4-ANT-SYNC).

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-24
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS anti_library (
            concept_id     VARCHAR(64) PRIMARY KEY,
            client_id      VARCHAR(64),
            label          VARCHAR(256) NOT NULL,
            reason         VARCHAR(512),
            name_pattern   VARCHAR(256),
            strategy_ids   JSONB,
            seeded         BOOLEAN NOT NULL DEFAULT FALSE,
            active         BOOLEAN NOT NULL DEFAULT TRUE,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_anti_library_active ON anti_library (active);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS anti_library;")
