"""Column-privilege tests (Security.md §16.2) — authorization Layer 3.

RLS answers "which rows?". Column GRANTs answer "which columns?", and they are
the layer that survives a total service-layer bypass: even with RLS satisfied
and every application check skipped, a citizen connection physically cannot
write `requests.status_id`, because the privilege was never granted.

Two failure shapes appear here, and the difference matters:

* **InsufficientPrivilegeError** — the column GRANT refused. The statement is
  rejected before any row is considered.
* **rowcount == 0** — the GRANT allowed the column, but an RLS policy filtered
  every candidate row away. No error, no rows changed.

A test asserting the wrong one of those passes for the wrong reason.
"""

from __future__ import annotations

import pytest
from asyncpg.exceptions import InsufficientPrivilegeError
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from tests.conftest import RlsConn
from tests.factories import Seed

pytestmark = pytest.mark.security

# asyncpg raises InsufficientPrivilegeError; SQLAlchemy wraps it in
# ProgrammingError. Accept either, so the assertion is about the database's
# answer rather than about driver plumbing.
DENIED = (ProgrammingError, InsufficientPrivilegeError)


async def test_citizen_cannot_set_own_request_status(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """Layer 3. Even with a total service-layer bypass, this fails.

    Self-approval is the highest-value attack against a permits portal.
    """
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(DENIED):
            await conn.execute(
                text("UPDATE requests SET status_id = :s WHERE id = :r"),
                {"s": seed.status_approved.id, "r": seed.request_of_citizen_a.id},
            )


async def test_citizen_cannot_set_own_tracking_code(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """The tracking code is trigger-generated and is the lookup key for the
    public status page. A citizen choosing it could collide deliberately."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(DENIED):
            await conn.execute(
                text("UPDATE requests SET tracking_code = :t WHERE id = :r"),
                {"t": "WTQ-2026-DEADBEEF01", "r": seed.request_of_citizen_a.id},
            )


async def test_citizen_cannot_assign_staff_to_own_request(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(DENIED):
            await conn.execute(
                text("UPDATE requests SET assigned_staff_id = :s WHERE id = :r"),
                {"s": seed.clerk_tunis.id, "r": seed.request_of_citizen_a.id},
            )


async def test_citizen_cannot_self_verify_document(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    """Verifying your own ID scan defeats the entire document-check workflow."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(DENIED):
            await conn.execute(
                text("UPDATE documents SET status = 'verified' WHERE id = :d"),
                {"d": seed.document_of_citizen_a.id},
            )


async def test_staff_cannot_read_password_hash(staff_conn: RlsConn, seed: Seed) -> None:
    """An offline cracking corpus must not be one SELECT away."""
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        with pytest.raises(DENIED):
            await conn.execute(text("SELECT password_hash FROM staff LIMIT 1"))


async def test_staff_cannot_read_mfa_secret(staff_conn: RlsConn, seed: Seed) -> None:
    """Reading a colleague's TOTP seed is a complete MFA bypass for that account."""
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        with pytest.raises(DENIED):
            await conn.execute(text("SELECT mfa_secret FROM staff LIMIT 1"))


async def test_citizen_cannot_read_any_password_hash(
    citizen_conn: RlsConn, seed: Seed
) -> None:
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(DENIED):
            await conn.execute(text("SELECT password_hash FROM users LIMIT 1"))


async def test_staff_can_read_the_columns_they_need(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """Positive control. If the GRANTs were simply absent, every test above
    would pass while the application was completely broken."""
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        rows = (
            await conn.execute(
                text("SELECT id, status_id, tracking_code FROM requests WHERE id = :r"),
                {"r": seed.request_of_citizen_a.id},
            )
        ).all()
    assert len(rows) == 1, "clerk cannot read the request they are meant to process"


async def test_clerk_cannot_refund_payment(staff_conn: RlsConn, seed: Seed) -> None:
    """Clerk lacks payment.refund, so the RLS policy denies the UPDATE even
    though the payment is inside their office scope.

    Note the assertion shape: rowcount, not an exception. The column GRANT
    permits the write; `payments_staff_update` filters the row away.
    """
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        result = await conn.execute(
            text("UPDATE payments SET status = 'refunded' WHERE id = :p"),
            {"p": seed.payment_tunis.id},
        )
    assert result.rowcount == 0, "a clerk without payment.refund altered a payment"


async def test_cashier_with_the_permission_can_refund(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """The positive control for the permission-gated policy: the boundary is the
    permission, not the office."""
    async with staff_conn(
        staff_id=seed.refunder.id, office_id=seed.office_tunis.id
    ) as conn:
        result = await conn.execute(
            text("UPDATE payments SET status = 'refunded' WHERE id = :p"),
            {"p": seed.payment_tunis.id},
        )
    assert result.rowcount == 1, (
        "payment.refund granted nothing — the policy may be denying everything"
    )


async def test_cashier_cannot_refund_outside_their_office(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """Both halves of the AND in payments_staff_update must bind."""
    async with staff_conn(
        staff_id=seed.refunder.id, office_id=seed.office_tunis.id
    ) as conn:
        result = await conn.execute(
            text("UPDATE payments SET status = 'refunded' WHERE id = :p"),
            {"p": seed.payment_sfax.id},
        )
    assert result.rowcount == 0, "permission overrode the office boundary"


async def test_access_log_is_write_only_for_app_roles(
    staff_conn: RlsConn, seed: Seed
) -> None:
    """access_log holds the evidence that catches an insider. If the role that
    writes it could also read or delete it, it would not be evidence.

    The schema grants INSERT but not SELECT, which is why the application must
    insert without RETURNING (Backend.md §9).
    """
    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        with pytest.raises(DENIED):
            await conn.execute(text("SELECT * FROM access_log LIMIT 1"))

    async with staff_conn(
        staff_id=seed.clerk_tunis.id, office_id=seed.office_tunis.id
    ) as conn:
        with pytest.raises(DENIED):
            await conn.execute(text("DELETE FROM access_log"))
