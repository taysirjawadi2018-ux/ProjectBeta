"""The RLS session contract — the most important code in the system.

Backend.md §4. Five engines, one per DB role (ADR-001); identity is set with
parameterized ``set_config(..., true)`` inside the transaction (ADR-002), so a
pooled connection can never carry one principal's identity into the next
request and the SQL injection vector at the identity statement does not exist.

Coverage target: 100% (Backend.md §12).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.core.principal import DbRole, Principal

_ENGINES: dict[DbRole, AsyncEngine] = {}


def _dsns() -> dict[DbRole, str]:
    s = get_settings()
    return {
        DbRole.CITIZEN: str(s.dsn_citizen),
        DbRole.STAFF: str(s.dsn_staff),
        DbRole.AUTH: str(s.dsn_auth),
        DbRole.AUDITOR: str(s.dsn_auditor),
        DbRole.ADMIN: str(s.dsn_admin),
    }


def init_engines() -> None:
    """Create the five per-role engines. Call once at application startup."""
    s = get_settings()
    for role, dsn in _dsns().items():
        _ENGINES[role] = create_async_engine(
            dsn,
            pool_size=s.db_pool_size,
            max_overflow=s.db_max_overflow,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args={
                "server_settings": {
                    "application_name": f"watiq-api:{role}",
                    "statement_timeout": str(s.db_statement_timeout_ms),
                    "idle_in_transaction_session_timeout": "10000",
                },
                "ssl": "require",
            },
        )


def dispose_engines() -> None:
    """Dispose all engines. Call once at application shutdown / test teardown."""
    for engine in _ENGINES.values():
        engine.sync_engine.dispose()
    _ENGINES.clear()


def engine_for(role: DbRole) -> AsyncEngine:
    try:
        return _ENGINES[role]
    except KeyError:
        raise RuntimeError(
            f"no engine for {role}: init_engines() was never called"
        ) from None


def session_factory(role: DbRole) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine_for(role), expire_on_commit=False)


_SET_CONTEXT = text(
    """
    SELECT set_config('app.current_user_id',   :user_id,   true),
           set_config('app.current_staff_id',  :staff_id,  true),
           set_config('app.current_office_id', :office_id, true)
    """
)


@asynccontextmanager
async def rls_transaction(principal: Principal) -> AsyncIterator[AsyncConnection]:
    """Open a transaction bound to ``principal``'s DB role and identity.

    ``is_local = true`` scopes the settings to THIS transaction, so a pooled
    connection can never carry one citizen's identity into the next request.
    On COMMIT or ROLLBACK, Postgres discards them automatically.
    """
    engine = _ENGINES[principal.db_role]
    async with engine.connect() as conn, conn.begin():
        await conn.execute(
            _SET_CONTEXT,
            {
                # '' -> NULLIF('', ...) -> NULL -> matches nothing.
                "user_id":   str(principal.user_id)   if principal.user_id   else "",
                "staff_id":  str(principal.staff_id)  if principal.staff_id  else "",
                "office_id": str(principal.office_id) if principal.office_id else "",
            },
        )
        yield conn
