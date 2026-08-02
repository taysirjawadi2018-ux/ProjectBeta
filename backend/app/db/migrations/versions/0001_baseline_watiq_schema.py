"""Baseline: apply Watiq.sql verbatim.

This revision is never edited. Every subsequent schema change is its own
revision. Watiq.sql at the repo root remains the readable reference; this
file is how it reaches a database.
"""

from pathlib import Path

from alembic import op
from sqlalchemy.util import await_only

revision = "0001"
down_revision = None

_SQL = Path(__file__).parents[2] / "sql" / "watiq_baseline.sql"


def upgrade() -> None:
    conn = op.get_bind()
    asyncpg_conn = conn.connection.driver_connection
    await_only(asyncpg_conn.execute(_SQL.read_text(encoding="utf-8")))


def downgrade() -> None:
    raise NotImplementedError("The baseline is not reversible. Restore from backup.")
