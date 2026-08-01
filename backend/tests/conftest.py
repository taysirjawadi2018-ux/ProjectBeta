"""Test fixtures for the Watiq suite.

The security suite needs a **real** PostgreSQL running the real `Watiq.sql`.
There is no mocking here and there cannot be: the thing under test is 63 RLS
policies and a set of column-level GRANTs, which exist only inside Postgres. A
mocked connection would prove exactly nothing.

Point the suite at a database with ``WATIQ_TEST_DSN`` — an existing database
carrying the schema and the five LOGIN roles. If it is unset, the security
tests **skip with a loud reason** rather than passing vacuously. A green run
that silently tested nothing is worse than a red one.

Deliberately NOT reused: ``app.core.db.init_engines()``. It hardcodes
``ssl="require"`` (correct in production, per Security.md §10.1) and reads the
five production DSNs from settings. Tests need one host with configurable TLS.
What *is* mirrored exactly is the identity contract — see ``_rls_conn`` below.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from tests.factories import Seed, build_seed

# Role name -> the LOGIN user created by ops/postgres/init/00-create-login-roles.sql.
# These are the permission bundles from Watiq.sql §7 (ADR-001). None of them owns
# any object, which is exactly why RLS applies to them.
APP_USERS = {
    "citizen": "watiq_app_citizen",
    "staff": "watiq_app_staff",
    "auth": "watiq_app_auth",
    "auditor": "watiq_app_auditor",
    "admin": "watiq_app_admin",
}

# The schema's own numbers. If a migration changes them, these must be updated
# deliberately — that is the point. ops/backup/restore-drill.sh makes the same
# assertion after a restore, for the same reason.
EXPECTED_POLICY_COUNT = 63
EXPECTED_RLS_TABLE_COUNT = 14

_SKIP_REASON = (
    "No test database. Set WATIQ_TEST_DSN to a Postgres carrying the Watiq schema "
    "and the five LOGIN roles:\n"
    "  createdb watiq_test\n"
    "  psql watiq_test -f Watiq.sql\n"
    "  psql watiq_test -v citizen_pw=t ... -f ops/postgres/init/00-create-login-roles.sql\n"
    "  export WATIQ_TEST_DSN=postgresql+asyncpg://watiq_migrate:pw@localhost/watiq_test"
)


def _dsn_for(base_dsn: str, user: str, password: str) -> str:
    """Swap the credentials in a DSN, leaving host/port/database intact."""
    parts = urlsplit(base_dsn)
    netloc = f"{user}:{password}@{parts.hostname or 'localhost'}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


@pytest.fixture(scope="session")
def test_dsn() -> str:
    dsn = os.getenv("WATIQ_TEST_DSN")
    if not dsn:
        pytest.skip(_SKIP_REASON)
    return dsn


@pytest.fixture(scope="session")
def app_password() -> str:
    """Shared password for the five LOGIN users, in the test cluster only."""
    return os.getenv("WATIQ_TEST_APP_PASSWORD", "t")


@pytest.fixture(scope="session")
def connect_args() -> dict[str, Any]:
    """A local test cluster usually has no TLS; production always does.

    ``WATIQ_TEST_SSL=require`` exercises the production setting when the test
    cluster has certificates.
    """
    return {"ssl": os.getenv("WATIQ_TEST_SSL", "disable")}


@pytest_asyncio.fixture
async def owner_engine(
    test_dsn: str, connect_args: dict[str, Any]
) -> AsyncIterator[AsyncEngine]:
    """Engine for the schema owner. Seeds data; never used for an assertion.

    The schema preflight runs here rather than in a separate autouse fixture:
    resolving one async fixture from another via `getfixturevalue` fails inside
    a running event loop, and an autouse session fixture would also drag the
    database requirement onto the unit tests, which correctly need no database.
    Every database test reaches this engine, so this is the right chokepoint.
    """
    engine = create_async_engine(test_dsn, connect_args=connect_args)
    try:
        await _assert_schema_is_loaded(engine)
        yield engine
    finally:
        await engine.dispose()


async def _assert_schema_is_loaded(engine: AsyncEngine) -> None:
    """Fail loudly if the schema is not what the suite thinks it is testing.

    A database that restored without its policies looks exactly like a healthy
    one until someone reads another citizen's file. Every isolation test in the
    suite would ALSO pass against a completely empty database, so the counts are
    checked before any of them run.
    """
    async with engine.connect() as conn:
        policies = (await conn.execute(text("SELECT count(*) FROM pg_policies"))).scalar()
        rls_tables = (
            await conn.execute(
                text(
                    "SELECT count(*) FROM pg_class c "
                    "  JOIN pg_namespace n ON n.oid = c.relnamespace "
                    " WHERE n.nspname = 'public' AND c.relkind = 'r' "
                    "   AND c.relrowsecurity"
                )
            )
        ).scalar()

    assert policies == EXPECTED_POLICY_COUNT, (
        f"expected {EXPECTED_POLICY_COUNT} RLS policies, found {policies}. "
        "The access-control model is not fully loaded, so every isolation test "
        "below would be meaningless."
    )
    assert rls_tables == EXPECTED_RLS_TABLE_COUNT, (
        f"expected RLS enabled on {EXPECTED_RLS_TABLE_COUNT} tables, found {rls_tables}."
    )


@pytest_asyncio.fixture
async def app_engines(
    test_dsn: str, app_password: str, connect_args: dict[str, Any]
) -> AsyncIterator[dict[str, AsyncEngine]]:
    """One engine per application role, mirroring the five production pools."""
    engines = {
        role: create_async_engine(
            _dsn_for(test_dsn, user, app_password), connect_args=connect_args
        )
        for role, user in APP_USERS.items()
    }
    try:
        yield engines
    finally:
        for engine in engines.values():
            await engine.dispose()


# Everything the seed creates, in reverse dependency order. The shipped
# reference data (roles, permissions, statuses, service_catalog, categories,
# payment_types) is NOT listed: it comes from Watiq.sql and must survive.
_MUTABLE_TABLES = (
    "access_log",
    "notifications",
    "status_history",
    "appointments",
    "appointment_slots",
    "documents",
    "payments",
    "requests",
    "user_steg_account",
    "verification_codes",
    "sessions",
    "staff_recovery_codes",
    "staff",
    "users",
    "office_services",
    "offices",
)


@pytest_asyncio.fixture
async def seed(owner_engine: AsyncEngine) -> AsyncIterator[Seed]:
    """Build the two-citizen, two-office graph, then truncate it afterwards.

    Seeding runs as the owner because RLS does not apply to owners — it is the
    only principal that can create rows on both sides of every isolation
    boundary the tests are about to probe.

    The seed is COMMITTED, not held open in a rolled-back transaction. The
    tempting "wrap each test in a transaction and roll back" pattern cannot work
    here: the assertions run on *different connections* (one per DB role, which
    is the whole point), and an uncommitted row is invisible to every connection
    but the one that wrote it. A suite built that way fails only on its positive
    controls — the tests that expect to SEE data — which reads exactly like a
    broken RLS policy and wastes an afternoon.

    Isolation therefore comes from truncating afterwards. That makes the suite
    single-threaded against one database; do not add pytest-xdist without giving
    each worker its own.
    """
    async with owner_engine.begin() as conn:
        seeded = await build_seed(conn)

    try:
        yield seeded
    finally:
        async with owner_engine.begin() as conn:
            await conn.execute(
                text(
                    f"TRUNCATE {', '.join(_MUTABLE_TABLES)} RESTART IDENTITY CASCADE"
                )
            )


# ---------------------------------------------------------------------------
# The identity contract. This MUST stay equivalent to
# app.core.db.rls_transaction (Backend.md §4, ADR-002), or the suite is testing
# something the application never does.
# ---------------------------------------------------------------------------

_SET_CONTEXT = text(
    """
    SELECT set_config('app.current_user_id',   :user_id,   true),
           set_config('app.current_staff_id',  :staff_id,  true),
           set_config('app.current_office_id', :office_id, true)
    """
)

RlsConn = Callable[..., Any]


def rls_conn_for(engine: AsyncEngine) -> RlsConn:
    @asynccontextmanager
    async def _open(
        user_id: int | None = None,
        staff_id: int | None = None,
        office_id: int | None = None,
    ) -> AsyncIterator[AsyncConnection]:
        async with engine.connect() as conn, conn.begin():
            await conn.execute(
                _SET_CONTEXT,
                {
                    # '' -> NULLIF('', ...) -> NULL -> matches nothing.
                    # Bind parameters, never interpolation: SET LOCAL cannot be
                    # parameterized, which is precisely why set_config() is used
                    # (Security.md §9.1).
                    "user_id": str(user_id) if user_id else "",
                    "staff_id": str(staff_id) if staff_id else "",
                    "office_id": str(office_id) if office_id else "",
                },
            )
            yield conn

    return _open


@pytest_asyncio.fixture
async def citizen_conn(app_engines: dict[str, AsyncEngine]) -> RlsConn:
    return rls_conn_for(app_engines["citizen"])


@pytest_asyncio.fixture
async def staff_conn(app_engines: dict[str, AsyncEngine]) -> RlsConn:
    return rls_conn_for(app_engines["staff"])


@pytest_asyncio.fixture
async def auth_conn(app_engines: dict[str, AsyncEngine]) -> RlsConn:
    return rls_conn_for(app_engines["auth"])


@pytest_asyncio.fixture
async def auditor_conn(app_engines: dict[str, AsyncEngine]) -> RlsConn:
    return rls_conn_for(app_engines["auditor"])


@pytest_asyncio.fixture
async def admin_conn(app_engines: dict[str, AsyncEngine]) -> RlsConn:
    return rls_conn_for(app_engines["admin"])


@pytest_asyncio.fixture(params=sorted(APP_USERS))
async def any_app_conn(
    request: pytest.FixtureRequest, app_engines: dict[str, AsyncEngine]
) -> RlsConn:
    """Parametrized over all five roles: an invariant asserted here holds for
    every connection the application can possibly open."""
    return rls_conn_for(app_engines[request.param])
