"""HTTP only: citizen notification endpoints (Structure.md §3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbConn
from app.core.errors import NotFound, Unauthorized
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationListOut

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    conn: DbConn,
    principal: CurrentUser,
    cursor: str | None = Query(default=None),
    size: int | None = Query(default=None, ge=1, le=100),
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await service.list_notifications(
        conn, principal.user_id, size=size, cursor=cursor,
    )


@router.get("/unread-count")
async def unread_count(conn: DbConn, principal: CurrentUser) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return {"unread_count": await service.unread_count(conn, principal.user_id)}


@router.post("/{notification_id}/read")
async def mark_read(conn: DbConn, principal: CurrentUser, notification_id: int) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    if not await service.mark_read(conn, notification_id, principal.user_id):
        raise NotFound("notification_not_found")
    return {"status": "read"}


@router.post("/read-all")
async def mark_all_read(conn: DbConn, principal: CurrentUser) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    await service.mark_all_read(conn, principal.user_id)
    return {"status": "read"}
