"""Alembic environment — migration user only (Structure.md §6 rule 3).

The migration DSN is NOT an app setting: application roles have no DDL
privilege, so even if someone ships a misconfigured env var, `alembic`
must refuse to run as anything but `watiq_migrate`. The DSN comes from
`WATIQ_MIGRATE_DSN` (or the `WATIQ_MIGRATE_DSN_FILE` Docker secret).
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import make_url
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_MIGRATION_ROLES = {"watiq_migrate", "postgres"}


def _migration_dsn() -> str:
    """WATIQ_MIGRATE_DSN, or WATIQ_MIGRATE_DSN_FILE (Docker secret) contents."""
    dsn = os.environ.get("WATIQ_MIGRATE_DSN")
    if dsn:
        return dsn
    secret = os.environ.get("WATIQ_MIGRATE_DSN_FILE")
    if secret:
        return open(secret, encoding="utf-8").read().strip()
    raise RuntimeError(
        "WATIQ_MIGRATE_DSN (or WATIQ_MIGRATE_DSN_FILE) is required to run migrations"
    )


def _assert_migration_user(dsn: str) -> None:
    url = make_url(dsn)
    if url.username not in _MIGRATION_ROLES and not url.username.startswith("postgres."):
        raise RuntimeError(
            f"migrations must run as one of {_MIGRATION_ROLES} (or 'postgres.<project-ref>'), "
            f"got '{url.username}'. "
            "Application roles hold no DDL privilege; never point alembic at an app-role DSN."
        )


def run_migrations_offline() -> None:
    dsn = _migration_dsn()
    _assert_migration_user(dsn)
    context.configure(
        url=dsn,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=None,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    dsn = _migration_dsn()
    _assert_migration_user(dsn)
    connectable = create_async_engine(
        dsn,
        # Supabase's pgbouncer (transaction mode) rejects prepared statements
        # (DuplicatePreparedStatementError); asyncpg must run un-prepared.
        connect_args={"statement_cache_size": 0},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
