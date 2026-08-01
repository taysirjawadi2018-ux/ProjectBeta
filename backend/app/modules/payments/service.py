"""Payment business rules (Backend.md §5.2, §10; ADR-005).

The schema grants citizens SELECT only on payments (Watiq.sql line 1418) —
payment records are created and confirmed by the ARQ `reconcile_payments` job
on the watiq_admin engine, idempotently. These service functions are the
worker's API; the routers only expose reads, plus the staff filtered view.

Idempotency: claim_idempotency_key BEFORE the INSERT, store_idempotent_response
AFTER, read_idempotent_response for replays (fail closed — Backend.md §5.5).
The confirm flow is a state-machine transition (pending -> completed), so its
WHERE status='pending' makes retries no-ops rather than replays.

reference_number and transaction_id are masked for everyone except the
national_auditor role: Watiq.sql line 972 forbids them in plaintext logs and
v_payment_overview masks them — the API must do the same (Backend.md §11).
"""

from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import Conflict, NotFound
from app.core.idempotency import (
    claim_idempotency_key,
    read_idempotent_response,
    store_idempotent_response,
)
from app.core.pagination import decode_cursor, encode_cursor, page_size
from app.core.principal import Principal
from app.modules.payments import repository as payments_repo
from app.modules.payments.schemas import PaymentConfirmIn, PaymentCreateIn, PaymentOut


def _mask(value: str | None) -> str | None:
    """Last-4 masking, mirroring fn_mask_tail() (Watiq.sql §0)."""
    if not value:
        return None
    return "••••" + value[-4:]


def _may_unmask(principal: Principal) -> bool:
    """Only the national_auditor role sees unmasked bank references."""
    return principal.role_code == "national_auditor"


def _to_out(row: dict[str, Any], *, unmask: bool) -> dict[str, Any]:
    """Project a payments row onto PaymentOut, masking bank references
    unless `unmask` (national_auditor only)."""
    reference = row.get("reference_number")
    transaction = row.get("transaction_id")
    return {
        "id": row["id"],
        "request_id": row.get("request_id"),
        "amount": row["amount"],
        "currency": row["currency"],
        "status": row["status"],
        "paid_at": row.get("paid_at"),
        "created_at": row.get("created_at"),
        "reference_masked": reference if unmask else _mask(reference),
        "transaction_masked": transaction if unmask else _mask(transaction),
    }


async def list_my(
    conn: AsyncConnection, *, cursor: str | None, limit: int | None,
) -> dict[str, Any]:
    """The caller's payments (RLS payments_owner), keyset on (created_at, id),
    always masked."""
    cd = decode_cursor(cursor)
    size = page_size(limit)
    rows = await payments_repo.list_my(
        conn,
        cursor_created_at=cd.get("created_at"),
        cursor_id=cd.get("id"),
        limit=size + 1,
    )
    has_more = len(rows) > size
    items = [_to_out(r, unmask=False) for r in rows[:size]]
    next_cursor: str | None = None
    if has_more and items:
        last = rows[size - 1]
        next_cursor = encode_cursor(created_at=str(last["created_at"]), id=last["id"])
    return {"items": items, "next_cursor": next_cursor}


async def create_intent(
    conn: AsyncConnection, *, user_id: int, data: PaymentCreateIn,
    idempotency_key: str,
) -> dict[str, Any]:
    """Create a pending payment intent, idempotently (Backend.md §5.2).

    Called by the ARQ `reconcile_payments` job (Backend.md §10) on the
    watiq_admin engine after the citizen completes gateway checkout. Citizens
    hold no INSERT on payments (Watiq.sql line 1418); the admin role does.

    1) claim the key; 2) INSERT status='pending'; 3) store the response.
    A replay (claim False) returns the stored response; a 'pending' key in
    Redis raises Conflict. Returns {"status", "body"} so the worker can replay
    the exact stored HTTP response.
    """
    principal_id = str(user_id)

    if not await claim_idempotency_key(idempotency_key, principal_id):
        stored = await read_idempotent_response(idempotency_key, principal_id)
        if stored is None:
            raise Conflict("idempotency_key_already_claimed")
        return stored

    type_row = await payments_repo.get_type_by_code(conn, data.type_code)
    if type_row is None:
        raise NotFound("payment_type_not_found")

    method_id = None
    if data.method_code:
        method_row = await payments_repo.get_method_by_code(conn, data.method_code)
        if method_row is None:
            raise NotFound("payment_method_not_found")
        method_id = method_row["id"]

    payment_id = await payments_repo.insert_payment(
        conn,
        user_id=user_id,
        type_id=type_row["id"],
        method_id=method_id,
        request_id=data.request_id,
        amount=data.amount,
        currency=data.currency,
    )
    body = PaymentOut(
        id=payment_id,
        request_id=data.request_id,
        amount=data.amount,
        currency=data.currency,
        status="pending",
        paid_at=None,
        created_at=None,
        reference_masked=None,
        transaction_masked=None,
    ).model_dump(mode="json")
    await store_idempotent_response(idempotency_key, principal_id, 201, body)
    return {"status": 201, "body": body}


async def confirm(
    conn: AsyncConnection, payment_id: int, data: PaymentConfirmIn,
) -> dict[str, Any]:
    """Gateway callback handling; runs in the ARQ `reconcile_payments` job
    (Backend.md §10) on the admin engine. Generates the bank reference, flips
    pending -> completed. The WHERE status='pending' makes a second confirm a
    no-op (NotFound) — the transition, not the request, is idempotent."""
    method_id = None
    if data.method_code:
        method_row = await payments_repo.get_method_by_code(conn, data.method_code)
        if method_row is None:
            raise NotFound("payment_method_not_found")
        method_id = method_row["id"]

    reference_number = f"WTQ-{payment_id}-{secrets.token_hex(4).upper()}"
    updated = await payments_repo.confirm_payment(
        conn,
        payment_id=payment_id,
        method_id=method_id,
        reference_number=reference_number,
        transaction_id=data.transaction_id,
    )
    if updated is None:
        raise NotFound("payment_not_found")
    row = await payments_repo.get_by_id(conn, payment_id)
    if row is None:
        raise NotFound("payment_not_found")
    return _to_out(row, unmask=True)   # worker side: full visibility for admin


async def get_one(
    conn: AsyncConnection, principal: Principal, payment_id: int,
) -> dict[str, Any]:
    """One payment (owner via RLS). Masked unless national_auditor."""
    row = await payments_repo.get_by_id(conn, payment_id)
    if row is None:
        raise NotFound("payment_not_found")
    return _to_out(row, unmask=_may_unmask(principal))


async def list_filtered(
    conn: AsyncConnection, principal: Principal, *, status: str | None,
    cursor: str | None, limit: int | None,
) -> dict[str, Any]:
    """Staff/auditor view (payment.view): office-scoped for clerks via RLS,
    national for auditors. Unmasked only for the national_auditor role."""
    cd = decode_cursor(cursor)
    size = page_size(limit)
    rows = await payments_repo.list_filtered(
        conn,
        status=status,
        cursor_created_at=cd.get("created_at"),
        cursor_id=cd.get("id"),
        limit=size + 1,
    )
    has_more = len(rows) > size
    unmask = _may_unmask(principal)
    items = [_to_out(r, unmask=unmask) for r in rows[:size]]
    next_cursor: str | None = None
    if has_more and items:
        last = rows[size - 1]
        next_cursor = encode_cursor(created_at=str(last["created_at"]), id=last["id"])
    return {"items": items, "next_cursor": next_cursor}
