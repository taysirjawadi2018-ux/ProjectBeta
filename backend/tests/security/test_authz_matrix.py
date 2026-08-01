"""The authorization matrix (Security.md §16.3) — every (role x object x verb).

The tests in `test_rls_isolation` and `test_column_grants` each prove one
boundary. This file proves the *shape* of the whole model: for each of the five
application roles, against each sensitive table, the answer is the one the
four-layer design says it should be.

Written as a table rather than as prose because that is how it gets reviewed. A
table added to the schema without a row here is a table nobody decided the
access rules for.
"""

from __future__ import annotations

import pytest
from asyncpg.exceptions import InsufficientPrivilegeError
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import RlsConn, rls_conn_for
from tests.factories import Seed

pytestmark = pytest.mark.security

DENIED = (ProgrammingError, InsufficientPrivilegeError)

# (role, table, may_select_at_all)
#
# This is about the GRANT, not about which rows come back. A role holding the
# privilege can still be filtered to zero rows by RLS — that is what the
# isolation suite covers. Here we assert only that the privilege itself is
# present or absent: a missing GRANT is a hard failure, and a present GRANT
# paired with a good policy is the intended design.
SELECT_MATRIX: list[tuple[str, str, bool]] = [
    # The auth role exists to log people in. It reaches credentials, and little else.
    ("auth", "users", True),
    ("auth", "sessions", True),
    ("auth", "verification_codes", True),
    # Citizens: their own service data, plus the public catalogue.
    ("citizen", "requests", True),
    ("citizen", "documents", True),
    ("citizen", "payments", True),
    ("citizen", "service_catalog", True),
    ("citizen", "offices", True),
    # Citizens must never enumerate the workforce or the audit trail.
    ("citizen", "staff", False),
    ("citizen", "access_log", False),
    ("citizen", "role_permissions", False),
    # Staff: casework inside their own office.
    ("staff", "requests", True),
    ("staff", "documents", True),
    ("staff", "payments", True),
    # NOTE: ("staff", "users") is deliberately absent. Staff hold COLUMN-level
    # SELECT on users, not table-level, so has_table_privilege returns false —
    # correctly. That is Layer 3 doing its job, and it is asserted properly in
    # test_staff_reads_users_by_column_not_by_table below.
    # ... the audit trail is evidence, not a working table.
    ("staff", "access_log", False),
    # The auditor is the role that reads the audit trail.
    ("auditor", "access_log", True),
    ("auditor", "requests", True),
]


@pytest.mark.parametrize(
    ("role", "table", "allowed"),
    SELECT_MATRIX,
    ids=[f"{r}-{t}-{'grant' if a else 'deny'}" for r, t, a in SELECT_MATRIX],
)
async def test_select_privilege_matrix(
    app_engines: dict[str, AsyncEngine], role: str, table: str, allowed: bool
) -> None:
    # Taken from app_engines directly rather than via
    # request.getfixturevalue(f"{role}_conn"): getfixturevalue on an ASYNC
    # fixture tries to start a second event loop and raises
    # "Runner.run() cannot be called from a running event loop".
    async with rls_conn_for(app_engines[role])() as conn:
        has_privilege = (
            await conn.execute(
                text("SELECT has_table_privilege(current_user, :t, 'SELECT')"),
                {"t": table},
            )
        ).scalar()

    assert has_privilege is allowed, (
        f"{role} {'should' if allowed else 'must NOT'} hold SELECT on {table}"
    )


async def test_staff_reads_users_by_column_not_by_table(staff_conn: RlsConn) -> None:
    """The clearest demonstration of Layer 3 in the whole schema.

    A clerk processing a request must see the citizen's name and CIN. They must
    never see the password hash or the lockout state. The schema achieves that
    with column GRANTs rather than a table GRANT, so `has_table_privilege` on
    `users` is FALSE for staff even though they can obviously read the table —
    a distinction worth a test of its own, because a future migration
    "fixing" that false with a table-level GRANT would hand out the credentials
    with it.
    """
    readable = ("id", "first_name", "last_name", "national_id", "phone", "address")
    forbidden = ("password_hash", "failed_login_attempts", "locked_until")

    async with staff_conn() as conn:
        assert (
            await conn.execute(
                text("SELECT has_table_privilege(current_user, 'users', 'SELECT')")
            )
        ).scalar() is False, (
            "staff gained TABLE-level SELECT on users; the column grants that "
            "withhold password_hash are now bypassed"
        )

        for column in readable:
            granted = (
                await conn.execute(
                    text("SELECT has_column_privilege(current_user, 'users', :c, 'SELECT')"),
                    {"c": column},
                )
            ).scalar()
            assert granted is True, f"staff cannot read users.{column}, needed for casework"

        for column in forbidden:
            granted = (
                await conn.execute(
                    text("SELECT has_column_privilege(current_user, 'users', :c, 'SELECT')"),
                    {"c": column},
                )
            ).scalar()
            assert granted is False, f"staff can read users.{column}"


# Writes that must be impossible for a citizen no matter what: each one would
# let a citizen decide the outcome of their own case.
CITIZEN_FORBIDDEN_WRITES: list[tuple[str, str]] = [
    ("requests", "status_id"),
    ("requests", "tracking_code"),
    ("requests", "assigned_staff_id"),
    ("requests", "office_id"),
    ("documents", "status"),
    ("documents", "verified_by"),
]


@pytest.mark.parametrize(
    ("table", "column"),
    CITIZEN_FORBIDDEN_WRITES,
    ids=[f"{t}.{c}" for t, c in CITIZEN_FORBIDDEN_WRITES],
)
async def test_citizen_holds_no_update_grant_on_outcome_columns(
    citizen_conn: RlsConn, table: str, column: str
) -> None:
    """Layer 3 stated as a privilege fact rather than as a failing statement.

    Asserting the GRANT directly means this still catches a regression even if
    some future RLS policy would have filtered the row away first and masked it.
    """
    async with citizen_conn() as conn:
        has_privilege = (
            await conn.execute(
                text("SELECT has_column_privilege(current_user, :t, :c, 'UPDATE')"),
                {"t": table, "c": column},
            )
        ).scalar()
    assert has_privilege is False, (
        f"citizen holds UPDATE on {table}.{column}; a citizen could decide their own case"
    )


async def test_no_app_role_can_rewrite_the_audit_trail(any_app_conn: RlsConn) -> None:
    """access_log is append-only for every role a request can run as.

    UPDATE or DELETE would let an attacker who reached the database erase the
    record of what they read — the one artifact that answers "whose data was
    accessed?" after an incident.

    `watiq_admin` is excluded, and that exclusion is a deliberate schema
    decision, not an oversight: Watiq.sql grants it SELECT/INSERT/UPDATE/DELETE
    on access_log so an administrator can service the table. It is the exact
    shape of the "compromised privileged operator" entry in Security.md §17 —
    the residual risk whose compensating control is off-host alerting and
    auditd, not a database privilege. `test_admin_can_rewrite_the_audit_trail`
    below pins that this remains a conscious choice.
    """
    async with any_app_conn() as conn:
        current = (await conn.execute(text("SELECT current_user"))).scalar()
        if current == "watiq_app_admin":
            pytest.skip("watiq_admin holds DML on access_log by design; see below")
        for verb in ("UPDATE", "DELETE", "TRUNCATE"):
            granted = (
                await conn.execute(
                    text("SELECT has_table_privilege(current_user, 'access_log', :v)"),
                    {"v": verb},
                )
            ).scalar()
            assert granted is False, f"{current} holds {verb} on access_log"


async def test_admin_can_rewrite_the_audit_trail_and_that_is_known(
    admin_conn: RlsConn,
) -> None:
    """Pins a known residual risk so it cannot become an unnoticed one.

    If a future migration revokes admin's UPDATE/DELETE on access_log — making
    the trail genuinely append-only for everyone — this test fails and someone
    gets to delete it, deliberately, along with the §17 caveat. That is the
    right way for a documented risk to disappear.
    """
    async with admin_conn() as conn:
        granted = [
            verb
            for verb in ("UPDATE", "DELETE")
            if (
                await conn.execute(
                    text("SELECT has_table_privilege(current_user, 'access_log', :v)"),
                    {"v": verb},
                )
            ).scalar()
        ]
    assert granted == ["UPDATE", "DELETE"], (
        "watiq_admin's DML on access_log changed; update Security.md §17 to match"
    )


async def test_only_admin_may_execute_the_erasure_function(
    any_app_conn: RlsConn,
) -> None:
    """fn_anonymize_user() destroys PII irreversibly and is watiq_admin-only.

    It is SECURITY DEFINER, so EXECUTE is the entire access control on it.
    """
    async with any_app_conn() as conn:
        current = (await conn.execute(text("SELECT current_user"))).scalar()
        granted = (
            await conn.execute(
                text(
                    "SELECT has_function_privilege(current_user, "
                    "  'fn_anonymize_user(integer,text,integer)', 'EXECUTE')"
                )
            )
        ).scalar()

    if current == "watiq_app_admin":
        assert granted is True, "the admin role cannot execute the erasure function"
    else:
        assert granted is False, f"{current} can irreversibly erase a citizen's PII"


# ---------------------------------------------------------------------------
# BOLA response shape (Security.md §7.3).
# ---------------------------------------------------------------------------


async def test_bola_and_nonexistent_are_indistinguishable(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """404, never 403 — and identical either way.

    A 403 would confirm the row exists, turning the error into an enumeration
    oracle: an attacker walking ids learns which are real. RLS makes the right
    behaviour the natural one, because the row simply is not there; the service
    returns None for both cases and the router raises one NotFound for both.
    """
    from app.modules.requests import service as requests_service

    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        someone_elses = await requests_service.get_request(
            conn, seed.request_of_citizen_b.id
        )
        never_existed = await requests_service.get_request(conn, 2_000_000_000)
        own = await requests_service.get_request(conn, seed.request_of_citizen_a.id)

    assert someone_elses is None, "BOLA: citizen A retrieved citizen B's request"
    assert never_existed is None
    assert someone_elses == never_existed, (
        "another citizen's request and a nonexistent one must be indistinguishable"
    )
    # Positive control: the same call works for the caller's own request, so the
    # two Nones above are RLS at work and not a broken query.
    assert own is not None


async def test_public_tracking_lookup_does_not_leak_other_citizens(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """track_by_code runs unauthenticated. RLS is the only thing standing
    between a guessed tracking code and someone else's case file.
    """
    from app.modules.requests import service as requests_service

    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        code = (
            await conn.execute(
                text("SELECT tracking_code FROM requests WHERE id = :r"),
                {"r": seed.request_of_citizen_a.id},
            )
        ).scalar()

    # An anonymous connection (no identity GUC) must not resolve that code.
    async with citizen_conn(user_id=None) as conn:
        assert await requests_service.track_by_code(conn, str(code)) is None

    # Nor may a different citizen.
    async with citizen_conn(user_id=seed.citizen_b.id) as conn:
        assert await requests_service.track_by_code(conn, str(code)) is None

    # The owner can. Positive control.
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        assert await requests_service.track_by_code(conn, str(code)) is not None
