"""Pydantic models for the notifications module (Structure.md §5).

Field names mirror Watiq.sql column names exactly — sent_via, never channel;
is_read, never read.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    request_id: int | None
    sent_via: str
    created_at: datetime


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None
    unread_count: int
