"""The RLS regression suite (Security.md §16.1). Non-negotiable.

Everything in `Watiq.sql` §7 is only true while it is true. A migration, a
refactor, or a hurried hotfix can quietly undo it, and nothing else in the
system would notice: the application would keep working, the other tests would
keep passing, and citizens' files would be readable by strangers.

These tests are the guard. If one of them fails, do not "fix the test".
"""

from __future__ import annotations

import pytest
from asyncpg.exceptions import InsufficientPrivilegeError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import RlsConn
from tests.factories import Seed

pytestmark = pytest.mark.security


# ---------------------------------------------------------------------------
# Citizen vs citizen — the canonical BOLA boundary.
# ---------------------------------------------------------------------------


async def test_citizen_cannot_read_other_citizens_requests(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """A -> B. THE canonical BOLA test."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE id = :rid"),
                {"rid": seed.request_of_citizen_b.id},
            )
        ).all()
    assert rows == [], "RLS BREACH: citizen A read citizen B's request"


async def test_citizen_can_read_own_request(citizen_conn: RlsConn, seed: Seed) -> None:
    """Positive control. Without it, a policy denying everything passes above."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE id = :rid"),
                {"rid": seed.request_of_citizen_a.id},
            )
        ).all()
    assert len(rows) == 1, "citizen A cannot read their OWN request; RLS is too strict"


async def test_citizen_cannot_read_other_citizens_documents(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM documents WHERE id = :did"),
                {"did": seed.document_of_citizen_b.id},
            )
        ).all()
    assert rows == [], "RLS BREACH: citizen A read citizen B's document"


async def test_citizen_cannot_read_other_citizens_payments(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM payments WHERE id = :pid"),
                {"pid": seed.payment_sfax.id},
            )
        ).all()
    assert rows == [], "RLS BREACH: citizen A read citizen B's payment"


async def test_citizen_unfiltered_select_returns_only_own_rows(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """The realistic bug: a forgotten WHERE clause. RLS must still hold."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        ids = {r.id for r in (await conn.execute(text("SELECT id FROM requests"))).all()}
    assert seed.request_of_citizen_b.id not in ids, "RLS BREACH via unfiltered SELECT"
    assert seed.request_of_citizen_a.id in ids


async def test_citizen_cannot_insert_a_request_for_someone_else(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """requests_owner_insert WITH CHECK. Attributing work to another citizen is
    both a privacy breach and a repudiation problem."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises((DBAPIError, InsufficientPrivilegeError)):
            await conn.execute(
                text(
                    "INSERT INTO requests (user_id, office_service_id, office_id) "
                    "SELECT :victim, office_service_id, office_id "
                    "  FROM requests WHERE id = :rid"
                ),
                {"victim": seed.citizen_b.id, "rid": seed.request_of_citizen_a.id},
            )


# ---------------------------------------------------------------------------
# Staff vs staff — the office boundary.
# ---------------------------------------------------------------------------


async def test_clerk_cannot_read_other_office_requests(
    staff_conn: RlsConn, seed: Seed
) -> None:
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE office_id = :oid"),
                {"oid": seed.office_sfax.id},
            )
        ).all()
    assert rows == [], "RLS BREACH: cross-office read"


async def test_clerk_can_read_own_office_requests(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """Positive control for the office boundary."""
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE office_id = :oid"),
                {"oid": seed.office_tunis.id},
            )
        ).all()
    assert len(rows) >= 1, "clerk cannot read their OWN office's requests"


async def test_policy_follows_the_office_guc_not_the_staff_row(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """The office scope comes from the session GUC, so a connection claiming
    Sfax sees Sfax — even holding a Tunis staff id. That is *by design*, and it
    is exactly why the GUC is set from the authenticated session and never from
    client input (Security.md §17, "RLS GUCs are asserted by the application").

    This pins the real boundary: the policy follows the GUC, so the
    application's job is to never let a client choose it.
    """
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_sfax.id
    ) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE office_id = :oid"),
                {"oid": seed.office_tunis.id},
            )
        ).all()
    assert rows == [], "policy did not follow the office GUC"


async def test_national_auditor_permission_grants_cross_office_read(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """The positive control. Without it, an all-deny bug would pass every other
    test in this file."""
    async with staff_conn(
        staff_id=seed.auditor.id, office_id=seed.office_tunis.id
    ) as conn:
        rows = (
            await conn.execute(
                text("SELECT id FROM requests WHERE office_id = :oid"),
                {"oid": seed.office_sfax.id},
            )
        ).all()
    assert len(rows) > 0, (
        "the 'request.view_all_offices' permission granted nothing — either RLS "
        "is denying everything, or fn_staff_has_permission is broken"
    )


async def test_clerk_without_the_permission_gets_no_national_read(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """The other half of the pair above: the permission, not the role name, is
    what opens the boundary."""
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        granted = (
            await conn.execute(
                text("SELECT fn_staff_has_permission(:s, 'request.view_all_offices')"),
                {"s": seed.clerk_tunis.id},
            )
        ).scalar()
    assert granted is False


# ---------------------------------------------------------------------------
# The session contract itself.
# ---------------------------------------------------------------------------


async def test_unset_context_returns_nothing(citizen_conn: RlsConn, seed: Seed) -> None:
    """No identity => NULLIF('', ...) => NULL => matches nothing."""
    async with citizen_conn(user_id=None) as conn:
        rows = (await conn.execute(text("SELECT id FROM requests"))).all()
    assert rows == [], "an anonymous connection read citizen data"


async def test_context_does_not_leak_across_transactions(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """set_config(..., true) must be transaction-local. If this fails, pooled
    connections carry identity between citizens — the worst bug available."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        assert (
            await conn.execute(text("SELECT app_current_user_id()"))
        ).scalar() == seed.citizen_a.id

    async with citizen_conn(user_id=None) as conn:
        assert (await conn.execute(text("SELECT app_current_user_id()"))).scalar() is None


async def test_identity_is_not_injectable(citizen_conn: RlsConn, seed: Seed) -> None:
    """set_config() takes a bind parameter, so a payload that would break out of
    a `SET LOCAL` is inert here: it lands in the GUC as an opaque string.

    This is the concrete version of Security.md §9.1. With string interpolation
    this exact input rewrites the attacker's own office scope; with a bind
    parameter the second statement never executes as SQL at all.

    The property under test is that `app.current_office_id` was NOT set. Reading
    the poisoned user_id GUC raises instead — app_current_user_id() casts to
    INTEGER — which is a perfectly good outcome, but it is not the interesting
    one, so it is asserted separately below.
    """
    payload = "1'; SET app.current_office_id = '99"

    async with citizen_conn(user_id=payload) as conn:
        # THE assertion: the injected second statement did not run.
        assert (
            await conn.execute(text("SELECT app_current_office_id()"))
        ).scalar() is None, "SQL injection through the identity GUC set the office scope"

        # And the raw GUC holds the payload verbatim — data, never syntax.
        assert (
            await conn.execute(text("SELECT current_setting('app.current_user_id', true)"))
        ).scalar() == payload

    # A non-numeric identity is rejected at the cast rather than silently
    # treated as "some user". Fail-closed, and loudly.
    with pytest.raises(DBAPIError):
        async with citizen_conn(user_id=payload) as conn:
            await conn.execute(text("SELECT app_current_user_id()"))


# ---------------------------------------------------------------------------
# The catastrophic misconfiguration.
# ---------------------------------------------------------------------------


async def test_app_roles_are_not_schema_owner(any_app_conn: RlsConn) -> None:
    """RLS does not apply to owners. If an app role ever owns a table, or gains
    superuser or BYPASSRLS, every policy above becomes decoration.

    Parametrized across all five roles by the fixture.
    """
    async with any_app_conn() as conn:
        current = (await conn.execute(text("SELECT current_user"))).scalar()
        assert current not in ("postgres", "watiq_migrate"), (
            f"application connected as {current}; RLS would be silently inert"
        )

        assert (
            await conn.execute(
                text("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")
            )
        ).scalar() is False, f"{current} is a superuser; RLS is bypassed"

        assert (
            await conn.execute(
                text("SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user")
            )
        ).scalar() is False, f"{current} holds BYPASSRLS"

        owns = (
            await conn.execute(
                text(
                    "SELECT count(*) FROM pg_class c "
                    "  JOIN pg_roles r ON c.relowner = r.oid "
                    " WHERE r.rolname = current_user AND c.relkind = 'r'"
                )
            )
        ).scalar()
        assert owns == 0, f"{current} owns {owns} tables; RLS would be bypassed"


async def test_all_views_are_security_invoker(owner_engine: AsyncEngine) -> None:
    """security_invoker is load-bearing, not decoration (Architecture.md §1).

    Without it a view runs as its owner and hands back rows the caller's own
    policies would have denied — an RLS bypass wearing a view's clothing.
    """
    async with owner_engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT c.relname, "
                    "       coalesce(('security_invoker=true') = ANY(c.reloptions), false) "
                    "  FROM pg_class c "
                    "  JOIN pg_namespace n ON n.oid = c.relnamespace "
                    " WHERE n.nspname = 'public' AND c.relkind = 'v' "
                    " ORDER BY c.relname"
                )
            )
        ).all()

    assert len(rows) == 7, f"expected 7 views, found {len(rows)}"
    offenders = [name for name, invoker in rows if not invoker]
    assert offenders == [], f"views without security_invoker: {offenders}"
