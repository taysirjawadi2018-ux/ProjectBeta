"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Reads and the is_read writes run as the OWNER (watiq_citizen, enforced by the
notifications_owner_select / notifications_owner_update policies, which scope
every statement to user_id = app_current_user_id()); the INSERT path runs as
whoever the caller's engine is (see service.notify).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_LIST_FOR_USER = text(
    """
    SELECT id, user_id, request_id, type, title, message, is_read,
           sent_via, created_at
      FROM notifications
     WHERE user_id = :user_id
       AND (:cursor_ts IS NULL OR (created_at, id) < (:cursor_ts, :cursor_id))
     ORDER BY created_at DESC, id DESC
     LIMIT :limit
    """
)

_COUNT_UNREAD = text(
    """
    SELECT COUNT(*) FROM notifications
     WHERE user_id = :user_id AND is_read = FALSE
    """
)

_MARK_READ = text(
    """
    UPDATE notifications
       SET is_read = TRUE
     WHERE id = :id AND user_id = :user_id
     RETURNING id
    """
)

_MARK_ALL_READ = text(
    """
    UPDATE notifications
       SET is_read = TRUE
     WHERE user_id = :user_id AND is_read = FALSE
    """
)

_INSERT_NOTIFICATION = text(
    """
    INSERT INTO notifications (user_id, request_id, type, title, message, sent_via)
    VALUES (:user_id, :request_id, :type, :title, :message, :sent_via)
    RETURNING id
    """
)


async def list_for_user(
    conn: AsyncConnection,
    user_id: int,
    *,
    limit: int,
    cursor_ts: datetime | None = None,
    cursor_id: int | None = None,
) -> list[dict[str, Any]]:
    rows = await conn.execute(
        _LIST_FOR_USER,
        {
            "user_id": user_id,
            "limit": limit,
            "cursor_ts": cursor_ts,
            "cursor_id": cursor_id,
        },
    )
    return [dict(r) for r in rows.fetchall()]


async def count_unread(conn: AsyncConnection, user_id: int) -> int:
    value = (await conn.execute(_COUNT_UNREAD, {"user_id": user_id})).scalar()
    return int(value) if value is not None else 0


async def mark_read(conn: AsyncConnection, notification_id: int, user_id: int) -> bool:
    """True only if the row exists AND belongs to the caller. The owner RLS
    policy silently drops UPDATEs on other users' rows; RETURNING id makes
    that distinguishable from 'already read'."""
    row = (
        await conn.execute(
            _MARK_READ, {"id": notification_id, "user_id": user_id}
        )
    ).first()
    return row is not None


async def mark_all_read(conn: AsyncConnection, user_id: int) -> None:
    await conn.execute(_MARK_ALL_READ, {"user_id": user_id})


async def create(
    conn: AsyncConnection,
    *,
    user_id: int,
    request_id: int | None,
    type: str,
    title: str,
    message: str,
    sent_via: str,
) -> int:
    row = (
        await conn.execute(
            _INSERT_NOTIFICATION,
            {
                "user_id": user_id,
                "request_id": request_id,
                "type": type,
                "title": title,
                "message": message,
                "sent_via": sent_via,
            },
        )
    ).first()
    return int(row.id) if row else 0
