"""Baseline: apply Watiq.sql verbatim.

This revision is never edited. Every subsequent schema change is its own
revision. Watiq.sql at the repo root remains the readable reference; this
file is how it reaches a database.
"""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None

_SQL = Path(__file__).parents[2] / "sql" / "watiq_baseline.sql"


def upgrade() -> None:
    op.execute(_SQL.read_text(encoding="utf-8"))


def downgrade() -> None:
    raise NotImplementedError("The baseline is not reversible. Restore from backup.")
