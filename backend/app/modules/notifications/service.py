"""notifications module business rules (Structure.md §3): SQL lives in
repository.py. Services are what ARQ workers call; nothing here touches HTTP.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.pagination import decode_cursor, encode_cursor, page_size
from app.modules.notifications import repository as notifications_repo


async def list_notifications(
    conn: AsyncConnection,
    user_id: int,
    *,
    size: int | None,
    cursor: str | None,
) -> dict[str, Any]:
    """Newest-first, keyset-paginated inbox (Backend.md §11): the cursor
    encodes (created_at, id) of the last row returned; the keyset WHERE keeps
    each page bounded. unread_count rides along so the SPA badge and the list
    never drift within one request."""
    limit = page_size(size)
    params = decode_cursor(cursor)
    raw_ts = params.get("created_at")
    raw_id = params.get("id")
    cursor_ts = datetime.fromisoformat(raw_ts) if isinstance(raw_ts, str) else None
    cursor_id = int(raw_id) if isinstance(raw_id, (int, str)) else None

    items = await notifications_repo.list_for_user(
        conn, user_id, limit=limit, cursor_ts=cursor_ts, cursor_id=cursor_id,
    )
    unread = await notifications_repo.count_unread(conn, user_id)

    next_cursor: str | None = None
    if len(items) == limit and items:
        last = items[-1]
        next_cursor = encode_cursor(created_at=last["created_at"], id=last["id"])
    return {"items": items, "next_cursor": next_cursor, "unread_count": unread}


async def unread_count(conn: AsyncConnection, user_id: int) -> int:
    return await notifications_repo.count_unread(conn, user_id)


async def mark_read(conn: AsyncConnection, notification_id: int, user_id: int) -> bool:
    """True if the notification exists and belongs to the caller; ownership is
    enforced by the notifications_owner_update RLS policy, the repository
    never invents a user_id clause of its own."""
    return await notifications_repo.mark_read(conn, notification_id, user_id)


async def mark_all_read(conn: AsyncConnection, user_id: int) -> None:
    await notifications_repo.mark_all_read(conn, user_id)


async def notify(
    conn: AsyncConnection,
    *,
    user_id: int,
    request_id: int | None = None,
    type: str,
    title: str,
    message: str,
    sent_via: str = "push",
) -> int:
    """Insert one notification; returns its id.

    Called by OTHER modules' services (requests, appointments) and the ARQ
    worker — never by the notifications router itself. The INSERT must run
    with the CALLER's engine: RLS has no insert policy for watiq_citizen
    (a citizen cannot fabricate their own notifications), so only the staff
    path (notifications_staff_insert — the target user must have a request
    at the caller's office) or watiq_admin can insert. The ARQ worker
    connects as a staff/admin role.
    """
    return await notifications_repo.create(
        conn,
        user_id=user_id,
        request_id=request_id,
        type=type,
        title=title,
        message=message,
        sent_via=sent_via,
    )
