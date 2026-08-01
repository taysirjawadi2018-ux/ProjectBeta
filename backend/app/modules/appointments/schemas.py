"""Pydantic models for the appointments module (Structure.md §5).

Field names mirror Watiq.sql columns exactly — office_service_id, never
service_id — so the column-grant mismatch cannot hide (Structure.md §5).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

# appointment_slots.time_slot format, e.g. '09:00-10:00' (Watiq.sql line 569).
TIME_SLOT_PATTERN = r"^\d{2}:\d{2}-\d{2}:\d{2}$"


class SlotOut(BaseModel):
    id: int
    office_id: int
    office_name: str | None = None
    governorate: str | None = None
    office_service_id: int | None = None
    slot_date: date | None = None
    time_slot: str | None = None
    capacity: int | None = None
    booked_count: int | None = None
    seats_left: int | None = None


class AppointmentCreateIn(BaseModel):
    """Booking payload. office_id is absent on purpose: the trigger
    derives it from the slot (Backend.md §7.1)."""

    slot_id: int
    office_service_id: int
    request_id: int | None = None
    reason: str | None = Field(default=None, max_length=2000)


class AppointmentOut(BaseModel):
    id: int
    slot_id: int | None = None
    request_id: int | None = None
    user_id: int | None = None
    office_id: int | None = None
    office_service_id: int | None = None
    status: str | None = None
    queue_number: str | None = None
    reason: str | None = None
    created_at: datetime | None = None
    slot_date: date | None = None
    time_slot: str | None = None


class AppointmentListOut(BaseModel):
    items: list[AppointmentOut]
    next_cursor: str | None = None


class SlotCreateIn(BaseModel):
    """Staff capacity definition. office_id is not a field: the service sets
    it from the principal's session, never from the client."""

    office_service_id: int | None = None      # NULL = open to any service
    slot_date: date
    time_slot: str = Field(pattern=TIME_SLOT_PATTERN, max_length=20)
    capacity: int = Field(gt=0)


class AppointmentStatusIn(BaseModel):
    status: str = Field(pattern=r"^(completed|no_show)$")
