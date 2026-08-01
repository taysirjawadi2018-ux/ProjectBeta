"""Pydantic models for the audit module (Structure.md §5).

Field names mirror Watiq.sql columns exactly. query_params is JSONB of search
filters — audit data, returned as-is, never the form payload itself.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


class AccessLogOut(BaseModel):
    id: int
    staff_id: int | None
    user_id: int | None
    action: str
    resource_type: str
    resource_id: int | None
    request_id: int | None
    document_id: int | None
    query_params: dict[str, Any] | None
    ip_address: str | None
    user_agent: str | None
    occurred_at: datetime


class AccessLogPageOut(BaseModel):
    items: list[AccessLogOut]
    next_cursor: str | None


class RequestOut(BaseModel):
    id: int
    tracking_code: str
    office_id: int
    status_id: int
    status_code: str
    submitted_at: datetime | None
    estimated_ready_date: date | None
    completed_at: datetime | None
    form_data: dict[str, Any]
    notes: str | None


class StatusHistoryOut(BaseModel):
    id: int
    request_id: int
    old_status_id: int | None
    new_status_id: int
    old_status_code: str | None
    new_status_code: str
    changed_by: int | None
    changed_at: datetime
    reason: str | None


class CitizenHistoryOut(BaseModel):
    requests: list[RequestOut]
    access_log: list[AccessLogOut]
    status_history: list[StatusHistoryOut]


class StaffActivityOut(BaseModel):
    items: list[AccessLogOut]
