"""audit module business rules (Structure.md §3): SQL lives in repository.py.

`record_access` is the single funnel every module uses to log read access —
staff lookups, downloads, exports — against their OWN engine's connection, so
RLS pins staff_id to the session GUC (access_log_insert_staff WITH CHECK) and
occurred_at stays trigger/default-owned (Backend.md §7.3).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.pagination import decode_cursor, encode_cursor
from app.modules.audit import repository as audit_repo


async def record_access(
    conn: AsyncConnection,
    *,
    staff_id: int | None,
    user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: int | None,
    request_id: int | None = None,
    document_id: int | None = None,
    query_params: dict[str, Any] | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Append one access_log row. Never sets occurred_at (the column DEFAULT
    owns it) and never uses RETURNING (the app roles hold INSERT, not SELECT).
    `action` is CHECK-constrained to view/list/search/download/export/print/
    anonymize/deactivate."""
    await audit_repo.insert_access_log(
        conn,
        staff_id=staff_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        request_id=request_id,
        document_id=document_id,
        query_params=query_params,
        ip=ip,
        user_agent=user_agent,
    )


async def list_access_log(
    conn: AsyncConnection,
    *,
    user_id: int | None = None,
    staff_id: int | None = None,
    resource_type: str | None = None,
    from_: datetime | None = None,
    to: datetime | None = None,
    cursor: str | None = None,
    limit: int,
) -> dict[str, Any]:
    """Keyset-cursor page over access_log, newest first: the cursor encodes
    the last row's (occurred_at, id) so the next page is a bounded tuple
    comparison (app.core.pagination). query_params is audit data and is
    returned as-is."""
    cursor_params = decode_cursor(cursor)
    occ = cursor_params.get("occurred_at")
    cursor_occurred_at = datetime.fromisoformat(occ) if isinstance(occ, str) else None
    rows = await audit_repo.list_access_log(
        conn,
        user_id=user_id,
        staff_id=staff_id,
        resource_type=resource_type,
        from_=from_,
        to=to,
        cursor_occurred_at=cursor_occurred_at,
        cursor_id=cursor_params.get("id"),
        limit=limit + 1,
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor(
            occurred_at=last["occurred_at"].isoformat(), id=last["id"]
        )
    return {"items": items, "next_cursor": next_cursor}


async def user_history(conn: AsyncConnection, user_id: int) -> dict[str, Any]:
    """Everything the AUDITOR role can see about one citizen: requests,
    their status changes, and every access_log row touching the account."""
    return {
        "requests": await audit_repo.list_user_requests(conn, user_id),
        "access_log": await audit_repo.list_user_access_log(conn, user_id),
        "status_history": await audit_repo.list_user_status_history(conn, user_id),
    }


async def staff_activity(conn: AsyncConnection, staff_id: int) -> dict[str, Any]:
    return {"items": await audit_repo.list_staff_access_log(conn, staff_id)}
