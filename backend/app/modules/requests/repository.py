"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Every statement runs inside the caller's RLS transaction; identity comes from
the session GUCs, never from a WHERE clause this repository invents.
requests_owner_* policies scope citizens to their own rows; the staff policies
(requests_staff_office) scope staff to their own office (Watiq.sql §7).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_INSERT_REQUEST = text(
    """
    INSERT INTO requests (user_id, office_service_id, priority_id, form_data)
    VALUES (:user_id, :office_service_id, :priority_id, CAST(:form_data AS jsonb))
    RETURNING id, tracking_code, status_id, submitted_at
    """
)

# Keyset pagination on (submitted_at, id) DESC. The NULL cursor branch makes the
# first page cursor-free without dynamic SQL. RLS (requests_owner_select) is the
# real "my requests" filter; :user_id is belt-and-braces.
_LIST_MY = text(
    """
    SELECT r.id, r.tracking_code, r.status_id, rs.name AS status_name,
           r.submitted_at, r.estimated_ready_date, r.completed_at
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
     WHERE r.user_id = :user_id
       AND (:cursor_submitted_at IS NULL
            OR r.submitted_at < :cursor_submitted_at
            OR (r.submitted_at = :cursor_submitted_at AND r.id < :cursor_id))
     ORDER BY r.submitted_at DESC, r.id DESC
     LIMIT :limit
    """
)

# Resolves office_service_id -> service_catalog.code, which selects the JSON
# Schema in formschemas/ (Security.md §8.2). The code is looked up server-side
# and never accepted from the client: a client able to name its own schema
# could name the loosest one. Public catalogue data, so every role can read it.
_GET_SERVICE_CODE = text(
    """
    SELECT sc.code
      FROM office_services os
      JOIN service_catalog sc ON sc.id = os.catalog_id
     WHERE os.id = :office_service_id
    """
)

_GET_BY_ID = text(
    """
    SELECT r.id, r.user_id, r.tracking_code, r.office_service_id, r.office_id,
           r.status_id, rs.name AS status_name, rs.is_final,
           r.priority_id, r.assigned_staff_id, r.assigned_at,
           r.form_data, r.submitted_at, r.estimated_ready_date, r.completed_at,
           r.notes
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
     WHERE r.id = :request_id
    """
)

# Public tracking lookup. Deliberately minimal: status and dates only, never PII
# (Security.md §7.3). RLS decides which row — if any — this query may see.
_GET_BY_TRACKING_CODE = text(
    """
    SELECT r.id, r.tracking_code, rs.name AS status_name, rs.is_final,
           r.submitted_at, r.estimated_ready_date, r.completed_at
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
     WHERE r.tracking_code = :tracking_code
    """
)

_LIST_HISTORY = text(
    """
    SELECT sh.id, sh.request_id, sh.old_status_id, sh.new_status_id,
           os.name AS old_status_name, ns.name AS new_status_name,
           sh.changed_by, sh.changed_at, sh.reason
      FROM status_history sh
      LEFT JOIN request_statuses os ON os.id = sh.old_status_id
      JOIN request_statuses ns ON ns.id = sh.new_status_id
     WHERE sh.request_id = :request_id
     ORDER BY sh.changed_at DESC, sh.id DESC
    """
)

# Unassigned work in the staff member's office. The office filter lives in RLS
# (requests_staff_office USING office_id = app_current_office_id()).
_LIST_OFFICE_QUEUE = text(
    """
    SELECT r.id, r.tracking_code, r.status_id, rs.name AS status_name,
           p.name AS priority_name, sc.name AS service_name,
           u.first_name || ' ' || u.last_name AS citizen_name,
           r.assigned_staff_id, r.submitted_at, r.estimated_ready_date, r.completed_at
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
      JOIN office_services os ON os.id = r.office_service_id
      JOIN service_catalog sc ON sc.id = os.catalog_id
      LEFT JOIN priorities p ON p.id = r.priority_id
      JOIN users u ON u.id = r.user_id
     WHERE r.assigned_staff_id IS NULL
       AND (:cursor_submitted_at IS NULL
            OR r.submitted_at < :cursor_submitted_at
            OR (r.submitted_at = :cursor_submitted_at AND r.id < :cursor_id))
     ORDER BY r.submitted_at DESC, r.id DESC
     LIMIT :limit
    """
)

# Staff list of the office's requests with an optional status filter.
_LIST_OFFICE = text(
    """
    SELECT r.id, r.tracking_code, r.status_id, rs.name AS status_name,
           p.name AS priority_name, sc.name AS service_name,
           u.first_name || ' ' || u.last_name AS citizen_name,
           r.assigned_staff_id, st.name AS assigned_staff_name,
           r.submitted_at, r.estimated_ready_date, r.completed_at
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
      JOIN office_services os ON os.id = r.office_service_id
      JOIN service_catalog sc ON sc.id = os.catalog_id
      LEFT JOIN priorities p ON p.id = r.priority_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN staff st ON st.id = r.assigned_staff_id
     WHERE (:status_id IS NULL OR r.status_id = :status_id)
       AND (:cursor_submitted_at IS NULL
            OR r.submitted_at < :cursor_submitted_at
            OR (r.submitted_at = :cursor_submitted_at AND r.id < :cursor_id))
     ORDER BY r.submitted_at DESC, r.id DESC
     LIMIT :limit
    """
)

# trg_requests_sync_assignment keeps assigned_at in lockstep (Watiq.sql §4).
_ASSIGN_TO_SELF = text(
    """
    UPDATE requests
       SET assigned_staff_id = :staff_id
     WHERE id = :request_id
       AND assigned_staff_id IS NULL
    RETURNING id, assigned_staff_id, assigned_at
    """
)

_GET_STATUS_BY_CODE = text(
    """
    SELECT id, code, name, is_final
      FROM request_statuses
     WHERE code = :code
    """
)

# RETURNING is fine here — only access_log forbids it (Backend.md §7.3). The
# completed_at logic: entering a final status stamps completion once; leaving
# one clears the stamp.
_UPDATE_STATUS = text(
    """
    UPDATE requests
       SET status_id = :new_status_id,
           completed_at = CASE
               WHEN :is_final THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
               ELSE NULL
           END
     WHERE id = :request_id
    RETURNING id, status_id, completed_at
    """
)

_INSERT_STATUS_HISTORY = text(
    """
    INSERT INTO status_history (request_id, old_status_id, new_status_id,
                                changed_by, reason)
    VALUES (:request_id, :old_status_id, :new_status_id, :changed_by, :reason)
    """
)


async def get_service_code(conn: AsyncConnection, office_service_id: int) -> str | None:
    """service_catalog.code for an office_service, or None if it does not exist."""
    row = (
        await conn.execute(
            _GET_SERVICE_CODE, {"office_service_id": office_service_id}
        )
    ).first()
    return str(row.code) if row is not None else None


async def insert_request(
    conn: AsyncConnection,
    *,
    user_id: int,
    office_service_id: int,
    priority_id: int | None,
    form_data: dict[str, Any],
) -> dict[str, Any]:
    row = (
        await conn.execute(
            _INSERT_REQUEST,
            {
                "user_id": user_id,
                "office_service_id": office_service_id,
                "priority_id": priority_id,
                "form_data": form_data,
            },
        )
    ).first()
    if row is None:
        return {}
    return {
        "id": int(row.id),
        "tracking_code": str(row.tracking_code),
        "status_id": int(row.status_id),
        "submitted_at": row.submitted_at,
    }


async def list_my(
    conn: AsyncConnection,
    *,
    user_id: int,
    cursor_submitted_at: datetime | None,
    cursor_id: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows = await conn.execute(
        _LIST_MY,
        {
            "user_id": user_id,
            "cursor_submitted_at": cursor_submitted_at,
            "cursor_id": cursor_id,
            "limit": limit,
        },
    )
    return [dict(r._mapping) for r in rows]


async def get_by_id(conn: AsyncConnection, request_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_BY_ID, {"request_id": request_id})).first()
    return dict(row._mapping) if row else None


async def get_by_tracking_code(
    conn: AsyncConnection, tracking_code: str
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _GET_BY_TRACKING_CODE, {"tracking_code": tracking_code}
        )
    ).first()
    return dict(row._mapping) if row else None


async def list_history(
    conn: AsyncConnection, request_id: int
) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_HISTORY, {"request_id": request_id})
    return [dict(r._mapping) for r in rows]


async def list_office_queue(
    conn: AsyncConnection,
    *,
    cursor_submitted_at: datetime | None,
    cursor_id: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows = await conn.execute(
        _LIST_OFFICE_QUEUE,
        {
            "cursor_submitted_at": cursor_submitted_at,
            "cursor_id": cursor_id,
            "limit": limit,
        },
    )
    return [dict(r._mapping) for r in rows]


async def list_office(
    conn: AsyncConnection,
    *,
    status_id: int | None,
    cursor_submitted_at: datetime | None,
    cursor_id: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows = await conn.execute(
        _LIST_OFFICE,
        {
            "status_id": status_id,
            "cursor_submitted_at": cursor_submitted_at,
            "cursor_id": cursor_id,
            "limit": limit,
        },
    )
    return [dict(r._mapping) for r in rows]


async def assign_to_self(
    conn: AsyncConnection, *, request_id: int, staff_id: int
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _ASSIGN_TO_SELF, {"request_id": request_id, "staff_id": staff_id}
        )
    ).first()
    return dict(row._mapping) if row else None


async def get_status_by_code(conn: AsyncConnection, code: str) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_STATUS_BY_CODE, {"code": code})).first()
    return dict(row._mapping) if row else None


async def update_status(
    conn: AsyncConnection,
    *,
    request_id: int,
    new_status_id: int,
    is_final: bool,
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _UPDATE_STATUS,
            {
                "request_id": request_id,
                "new_status_id": new_status_id,
                "is_final": is_final,
            },
        )
    ).first()
    return dict(row._mapping) if row else None


async def insert_status_history(
    conn: AsyncConnection,
    *,
    request_id: int,
    old_status_id: int | None,
    new_status_id: int,
    changed_by: int,
    reason: str | None,
) -> None:
    await conn.execute(
        _INSERT_STATUS_HISTORY,
        {
            "request_id": request_id,
            "old_status_id": old_status_id,
            "new_status_id": new_status_id,
            "changed_by": changed_by,
            "reason": reason,
        },
    )
