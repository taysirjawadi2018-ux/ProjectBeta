"""Pydantic models for the requests module (Structure.md §5).

Field names mirror the schema exactly. Trigger-owned or privilege-withheld
fields (tracking_code, status_id, office_id, assigned_staff_id) are absent from
every input model and `extra="forbid"` rejects mass-assignment attempts with a
422 before any SQL runs (Backend.md §7.1).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RequestCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    office_service_id: int = Field(gt=0)
    priority_id: int | None = Field(default=None, gt=0)
    form_data: dict[str, Any] = Field(default_factory=dict)


class RequestOut(BaseModel):
    id: int
    tracking_code: str
    office_service_id: int
    office_id: int
    status_id: int
    status_name: str
    priority_id: int | None
    assigned_staff_id: int | None
    assigned_at: datetime | None
    form_data: dict[str, Any]
    submitted_at: datetime
    estimated_ready_date: date | None
    completed_at: datetime | None
    notes: str | None


class RequestListItem(BaseModel):
    id: int
    tracking_code: str
    status_name: str
    submitted_at: datetime
    estimated_ready_date: date | None
    completed_at: datetime | None


class RequestsPage(BaseModel):
    items: list[RequestListItem]
    next_cursor: str | None


class StaffRequestItem(BaseModel):
    id: int
    tracking_code: str
    status_name: str
    priority_name: str | None
    service_name: str
    citizen_name: str
    assigned_staff_id: int | None
    assigned_staff_name: str | None
    submitted_at: datetime
    estimated_ready_date: date | None
    completed_at: datetime | None


class OfficePage(BaseModel):
    items: list[StaffRequestItem]
    next_cursor: str | None


class StatusUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_status_code: str = Field(min_length=1, max_length=50)
    reason: str | None = Field(default=None, max_length=2000)


# Public tracking response: status and dates only, never PII (Security.md §7.3).
class TrackOut(BaseModel):
    tracking_code: str
    status_name: str
    is_final: bool
    submitted_at: datetime
    estimated_ready_date: date | None
    completed_at: datetime | None


class HistoryOut(BaseModel):
    id: int
    old_status_name: str | None
    new_status_name: str
    changed_by: int | None
    changed_at: datetime
    reason: str | None
