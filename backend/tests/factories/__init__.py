"""Seed graph for the security suite (Security.md §16).

The whole RLS suite is an argument about *two* citizens and *two* offices. One
of each proves nothing: with a single citizen, a policy of `USING (true)` passes
every isolation test. So the graph below always builds a pair, and every
isolation assertion is "A must not see B's row" with B guaranteed to exist.

Seeded by the schema **owner**, deliberately. RLS does not apply to the owner
(that is the point of ADR-001, and what `test_app_roles_are_not_schema_owner`
guards), so the owner is the only principal that can create rows across two
citizens and two offices. Every *assertion* then runs as a non-owner app role.

Reference data is **looked up, not created**. `Watiq.sql` ships the real RBAC
model — 5 roles, 21 permissions, 69 role/permission grants, 10 statuses, 15
catalogue services — and the tests are far more valuable run against that than
against a synthetic model invented here. When these tests assert that a clerk
cannot see another office, they are asserting it about the `clerk` role as
actually shipped.

The four staff members separate four different questions, and each is bound to
a real shipped role:

* ``clerk_tunis``  — role `clerk`: office-scoped, holds neither of the
                     permissions below. The negative control.
* ``clerk_sfax``   — the other office, so cross-office denial is testable both ways.
* ``auditor``      — role `national_auditor`, which holds
                     ``request.view_all_offices``. The **positive** control:
                     without someone who legitimately sees across offices, a
                     catastrophic all-deny bug would pass every isolation test.
* ``refunder``     — role `director`, which holds ``payment.refund``, proving the
                     payments UPDATE policy discriminates on the permission and
                     not merely on the office.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# Structurally valid Argon2id hash, never a live credential. These rows exist so
# the column-GRANT tests have something to be denied SELECT on.
DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4"
    "$c2VlZHNlZWRzZWVkc2VlZA$Kq0mJ8ZQ4Xk1pR7vN3wYbT9sL2cF6hD5gA8eU4iO0zM"
)


@dataclass(frozen=True)
class Row:
    """A seeded row. `id` is what the tests actually use."""

    id: int


@dataclass(frozen=True)
class Seed:
    citizen_a: Row
    citizen_b: Row
    office_tunis: Row
    office_sfax: Row
    clerk_tunis: Row
    clerk_sfax: Row
    auditor: Row
    refunder: Row
    status_submitted: Row
    status_approved: Row
    request_of_citizen_a: Row
    request_of_citizen_b: Row
    document_of_citizen_a: Row
    document_of_citizen_b: Row
    payment_tunis: Row
    payment_sfax: Row


async def _scalar(conn: AsyncConnection, sql: str, **params: Any) -> int:
    value = (await conn.execute(text(sql), params)).scalar()
    assert value is not None, f"seed statement returned no id: {sql.strip()[:60]}"
    return int(value)


async def _lookup(conn: AsyncConnection, sql: str, **params: Any) -> int:
    """Read a shipped reference row, failing loudly if the schema changed."""
    value = (await conn.execute(text(sql), params)).scalar()
    assert value is not None, (
        f"expected reference data is missing from the schema: {sql.strip()}"
    )
    return int(value)


async def _role_with_permission(conn: AsyncConnection, permission_code: str) -> int:
    """The lowest-privilege shipped role holding `permission_code`.

    Resolved from the data rather than hardcoded, so the suite keeps testing the
    real RBAC wiring even if roles are renamed or re-scoped.
    """
    return await _lookup(
        conn,
        "SELECT r.id FROM roles r "
        "  JOIN role_permissions rp ON rp.role_id = r.id "
        "  JOIN permissions p ON p.id = rp.permission_id "
        " WHERE p.code = :code ORDER BY r.id LIMIT 1",
        code=permission_code,
    )


async def _assert_role_lacks(
    conn: AsyncConnection, role_id: int, permission_code: str
) -> None:
    """Guard the negative controls.

    If `clerk` ever gains request.view_all_offices, the cross-office isolation
    tests would start passing for the wrong reason — or failing mysteriously.
    Better to say so here.
    """
    held = (
        await conn.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM role_permissions rp "
                "  JOIN permissions p ON p.id = rp.permission_id "
                " WHERE rp.role_id = :r AND p.code = :code)"
            ),
            {"r": role_id, "code": permission_code},
        )
    ).scalar()
    assert held is False, (
        f"role {role_id} unexpectedly holds {permission_code}; the negative "
        "control in the RLS suite is no longer a negative control"
    )


async def build_seed(conn: AsyncConnection) -> Seed:
    """Create the full graph. Runs as the schema owner, inside a transaction.

    The caller wraps this in a transaction that is rolled back after each test,
    so the database is left untouched between tests.
    """
    # --- reference data: looked up, never created --------------------------
    # Watiq.sql ships all of this. Creating our own would test a model the
    # production system does not have.
    status_submitted = await _lookup(
        conn, "SELECT id FROM request_statuses WHERE code = 'submitted'"
    )
    status_approved = await _lookup(
        conn, "SELECT id FROM request_statuses WHERE code = 'approved'"
    )
    pay_type = await _lookup(conn, "SELECT id FROM payment_types ORDER BY id LIMIT 1")

    # --- RBAC: the shipped roles, chosen for what they actually hold -------
    # Asserted rather than assumed. If a future migration moves
    # request.view_all_offices off national_auditor, these lookups fail loudly
    # here instead of the positive control silently ceasing to prove anything.
    role_clerk = await _lookup(conn, "SELECT id FROM roles WHERE code = 'clerk'")
    role_auditor = await _role_with_permission(conn, "request.view_all_offices")
    role_refunder = await _role_with_permission(conn, "payment.refund")

    await _assert_role_lacks(conn, role_clerk, "request.view_all_offices")
    await _assert_role_lacks(conn, role_clerk, "payment.refund")

    # --- offices -----------------------------------------------------------
    office_tunis = await _scalar(
        conn,
        "INSERT INTO offices (name, type, governorate, city) "
        "VALUES ('Baladiyat Tunis', 'municipality', 'Tunis', 'Tunis') RETURNING id",
    )
    office_sfax = await _scalar(
        conn,
        "INSERT INTO offices (name, type, governorate, city) "
        "VALUES ('Baladiyat Sfax', 'municipality', 'Sfax', 'Sfax') RETURNING id",
    )

    # --- catalogue ---------------------------------------------------------
    # A shipped service. Both offices offer the same one, so a request differs
    # between them only by office — which is what the isolation tests probe.
    catalog_id = await _lookup(
        conn, "SELECT id FROM service_catalog ORDER BY id LIMIT 1"
    )
    os_tunis = await _scalar(
        conn,
        "INSERT INTO office_services (office_id, catalog_id) VALUES (:o, :c) RETURNING id",
        o=office_tunis,
        c=catalog_id,
    )
    os_sfax = await _scalar(
        conn,
        "INSERT INTO office_services (office_id, catalog_id) VALUES (:o, :c) RETURNING id",
        o=office_sfax,
        c=catalog_id,
    )

    # --- citizens ----------------------------------------------------------
    citizen_a = await _scalar(
        conn,
        "INSERT INTO users "
        "  (national_id, first_name, last_name, email, phone, password_hash) "
        "VALUES ('11111111', 'Amine', 'Ben Salah', 'a@example.tn', '+21611111111', :h) "
        "RETURNING id",
        h=DUMMY_HASH,
    )
    citizen_b = await _scalar(
        conn,
        "INSERT INTO users "
        "  (national_id, first_name, last_name, email, phone, password_hash) "
        "VALUES ('22222222', 'Bochra', 'Trabelsi', 'b@example.tn', '+21622222222', :h) "
        "RETURNING id",
        h=DUMMY_HASH,
    )

    # --- staff -------------------------------------------------------------
    clerk_tunis = await _scalar(
        conn,
        "INSERT INTO staff (office_id, role_id, name, email, password_hash) "
        "VALUES (:o, :r, 'Clerk Tunis', 'clerk.tunis@watiq.tn', :h) RETURNING id",
        o=office_tunis, r=role_clerk, h=DUMMY_HASH,
    )
    clerk_sfax = await _scalar(
        conn,
        "INSERT INTO staff (office_id, role_id, name, email, password_hash) "
        "VALUES (:o, :r, 'Clerk Sfax', 'clerk.sfax@watiq.tn', :h) RETURNING id",
        o=office_sfax, r=role_clerk, h=DUMMY_HASH,
    )
    auditor = await _scalar(
        conn,
        "INSERT INTO staff (office_id, role_id, name, email, password_hash) "
        "VALUES (:o, :r, 'National Auditor', 'auditor@watiq.tn', :h) RETURNING id",
        o=office_tunis, r=role_auditor, h=DUMMY_HASH,
    )
    refunder = await _scalar(
        conn,
        "INSERT INTO staff (office_id, role_id, name, email, password_hash) "
        "VALUES (:o, :r, 'Cashier Tunis', 'cashier.tunis@watiq.tn', :h) RETURNING id",
        o=office_tunis, r=role_refunder, h=DUMMY_HASH,
    )

    # --- requests ----------------------------------------------------------
    # status_id and tracking_code are left unset on purpose: they are owned by
    # trg_requests_before_insert. If that trigger ever stops firing, these
    # inserts fail NOT NULL and the suite reports it immediately.
    request_a = await _scalar(
        conn,
        "INSERT INTO requests (user_id, office_service_id, office_id, form_data) "
        "VALUES (:u, :os, :o, CAST('{\"copies\": 1}' AS jsonb)) RETURNING id",
        u=citizen_a, os=os_tunis, o=office_tunis,
    )
    request_b = await _scalar(
        conn,
        "INSERT INTO requests (user_id, office_service_id, office_id, form_data) "
        "VALUES (:u, :os, :o, CAST('{\"copies\": 2}' AS jsonb)) RETURNING id",
        u=citizen_b, os=os_sfax, o=office_sfax,
    )

    # --- documents ---------------------------------------------------------
    # storage_key is an object key, never a URL (chk_documents_storage_key_not_url).
    doc_a = await _scalar(
        conn,
        "INSERT INTO documents (request_id, storage_key, document_type) "
        "VALUES (:r, 'requests/2026/08/aaaaaaaa-0000-4000-8000-000000000001.pdf', "
        "        'cin_copy') RETURNING id",
        r=request_a,
    )
    doc_b = await _scalar(
        conn,
        "INSERT INTO documents (request_id, storage_key, document_type) "
        "VALUES (:r, 'requests/2026/08/bbbbbbbb-0000-4000-8000-000000000002.pdf', "
        "        'cin_copy') RETURNING id",
        r=request_b,
    )

    # --- payments ----------------------------------------------------------
    payment_tunis = await _scalar(
        conn,
        "INSERT INTO payments (user_id, request_id, type_id, amount) "
        "VALUES (:u, :r, :t, 5.000) RETURNING id",
        u=citizen_a, r=request_a, t=pay_type,
    )
    payment_sfax = await _scalar(
        conn,
        "INSERT INTO payments (user_id, request_id, type_id, amount) "
        "VALUES (:u, :r, :t, 5.000) RETURNING id",
        u=citizen_b, r=request_b, t=pay_type,
    )

    return Seed(
        citizen_a=Row(citizen_a),
        citizen_b=Row(citizen_b),
        office_tunis=Row(office_tunis),
        office_sfax=Row(office_sfax),
        clerk_tunis=Row(clerk_tunis),
        clerk_sfax=Row(clerk_sfax),
        auditor=Row(auditor),
        refunder=Row(refunder),
        status_submitted=Row(status_submitted),
        status_approved=Row(status_approved),
        request_of_citizen_a=Row(request_a),
        request_of_citizen_b=Row(request_b),
        document_of_citizen_a=Row(doc_a),
        document_of_citizen_b=Row(doc_b),
        payment_tunis=Row(payment_tunis),
        payment_sfax=Row(payment_sfax),
    )
