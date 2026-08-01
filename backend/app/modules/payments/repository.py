"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Every statement runs inside the caller's RLS transaction: payments_owner
scopes citizen rows, payments_staff_select / payments_auditor scope staff and
auditor reads, so no query here invents a user WHERE clause — identity comes
from the session GUCs.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_GET_TYPE_BY_CODE = text(
    """
    SELECT id, code, name
      FROM payment_types
     WHERE code = :code
    """
)

_GET_METHOD_BY_CODE = text(
    """
    SELECT id, code, name
      FROM payment_methods
     WHERE code = :code
    """
)

_INSERT_PAYMENT = text(
    """
    INSERT INTO payments (user_id, type_id, method_id, request_id,
                          amount, currency, status)
    VALUES (:user_id, :type_id, :method_id, :request_id,
            :amount, :currency, 'pending')
    RETURNING id
    """
)

_LIST_MY = text(
    """
    SELECT id, request_id, type_id, method_id, reference_number,
           transaction_id, amount, currency, status, paid_at, created_at
      FROM payments
     WHERE :cursor_created_at::timestamptz IS NULL
        OR (created_at, id) < (:cursor_created_at, :cursor_id)
     ORDER BY created_at DESC, id DESC
     LIMIT :limit
    """
)

_GET_BY_ID = text(
    """
    SELECT id, request_id, type_id, method_id, reference_number,
           transaction_id, amount, currency, status, paid_at, created_at
      FROM payments
     WHERE id = :payment_id
    """
)

_CONFIRM = text(
    """
    UPDATE payments
       SET status = 'completed',
           paid_at = CURRENT_TIMESTAMP,
           method_id = COALESCE(:method_id, method_id),
           reference_number = :reference_number,
           transaction_id = COALESCE(:transaction_id, transaction_id)
     WHERE id = :payment_id AND status = 'pending'
    RETURNING id
    """
)

_LIST_FILTERED = text(
    """
    SELECT id, request_id, type_id, method_id, reference_number,
           transaction_id, amount, currency, status, paid_at, created_at
      FROM payments
     WHERE (:status::VARCHAR IS NULL OR status = :status)
       AND (:cursor_created_at::timestamptz IS NULL
            OR (created_at, id) < (:cursor_created_at, :cursor_id))
     ORDER BY created_at DESC, id DESC
     LIMIT :limit
    """
)

# Worker-only (Backend.md §10): the reconcile_payments ARQ job lists every
# payment still awaiting the gateway, oldest first, bounded.
_LIST_PENDING = text(
    """
    SELECT id, request_id, user_id, type_id, method_id, reference_number,
           transaction_id, amount, currency, status, paid_at, created_at
      FROM payments
     WHERE status = 'pending'
     ORDER BY created_at, id
     LIMIT :limit
    """
)

# Worker-only: gateway reported the payment failed; keep the row for
# reconciliation reporting but stop retrying it. Same pending->terminal
# transition guard as _CONFIRM, so a concurrent confirm cannot be clobbered.
_MARK_FAILED = text(
    """
    UPDATE payments
       SET status = 'failed',
           reference_number = COALESCE(:reference_number, reference_number)
     WHERE id = :payment_id AND status = 'pending'
    RETURNING id
    """
)


async def get_type_by_code(conn: AsyncConnection, code: str) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_TYPE_BY_CODE, {"code": code})).first()
    return dict(row) if row else None


async def get_method_by_code(conn: AsyncConnection, code: str) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_METHOD_BY_CODE, {"code": code})).first()
    return dict(row) if row else None


async def insert_payment(
    conn: AsyncConnection, *, user_id: int, type_id: int, method_id: int | None,
    request_id: int | None, amount: Decimal, currency: str,
) -> int:
    row = (
        await conn.execute(
            _INSERT_PAYMENT,
            {
                "user_id": user_id,
                "type_id": type_id,
                "method_id": method_id,
                "request_id": request_id,
                "amount": amount,
                "currency": currency,
            },
        )
    ).first()
    return int(row.id) if row else 0


async def list_my(
    conn: AsyncConnection, *, cursor_created_at: str | None,
    cursor_id: Any | None, limit: int,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _LIST_MY,
            {
                "cursor_created_at": cursor_created_at,
                "cursor_id": cursor_id,
                "limit": limit,
            },
        )
    ).all()
    return [dict(r) for r in rows]


async def get_by_id(conn: AsyncConnection, payment_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_BY_ID, {"payment_id": payment_id})).first()
    return dict(row) if row else None


async def confirm_payment(
    conn: AsyncConnection, *, payment_id: int, method_id: int | None,
    reference_number: str, transaction_id: str | None,
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _CONFIRM,
            {
                "payment_id": payment_id,
                "method_id": method_id,
                "reference_number": reference_number,
                "transaction_id": transaction_id,
            },
        )
    ).first()
    return dict(row) if row else None


async def list_filtered(
    conn: AsyncConnection, *, status: str | None, cursor_created_at: str | None,
    cursor_id: Any | None, limit: int,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _LIST_FILTERED,
            {
                "status": status,
                "cursor_created_at": cursor_created_at,
                "cursor_id": cursor_id,
                "limit": limit,
            },
        )
    ).all()
    return [dict(r) for r in rows]


async def list_pending(conn: AsyncConnection, *, limit: int) -> list[dict[str, Any]]:
    """Worker-only: payments awaiting the gateway, oldest first."""
    rows = (await conn.execute(_LIST_PENDING, {"limit": limit})).all()
    return [dict(r) for r in rows]


async def mark_failed(
    conn: AsyncConnection, *, payment_id: int, reference_number: str | None,
) -> bool:
    """Worker-only: gateway reported failure; pending -> failed."""
    row = (await conn.execute(
        _MARK_FAILED,
        {"payment_id": payment_id, "reference_number": reference_number},
    )).first()
    return row is not None
