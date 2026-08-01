"""Appointment business rules (Backend.md §7.1, ADR-005).

Services never touch HTTP; SQL lives in repository.py. The overbooking guard
is the DB's job (chk_appointment_slots_not_overbooked + the row-locking
fn_sync_slot_booked_count trigger) — the service never computes counts, it
just inserts and lets a CheckViolationError surface as a 409 via
CONSTRAINT_ERRORS (Backend.md §8).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import BadRequest, Forbidden, NotFound, Unauthorized
from app.core.pagination import decode_cursor, encode_cursor, page_size
from app.core.principal import Principal
from app.modules.appointments import repository as appointments_repo
from app.modules.appointments.schemas import AppointmentCreateIn, SlotCreateIn


async def list_available_slots(
    conn: AsyncConnection, *, office_id: int, service_id: int | None,
    slot_date: date,
) -> list[dict[str, Any]]:
    """Bookable capacity for the booking UI (parity with v_slot_availability).

    The filter is is_active AND booked_count < capacity — the same predicate
    the booking flow relies on; the race between list and book is closed by
    the DB, not here.
    """
    if slot_date < date.today():
        raise BadRequest("Cannot list slots in the past.")
    return await appointments_repo.list_available_slots(
        conn, office_id=office_id, service_id=service_id, slot_date=slot_date
    )


async def book(
    conn: AsyncConnection, principal: Principal, data: AppointmentCreateIn,
) -> dict[str, Any]:
    """Create an appointment and notify the citizen.

    INSERT decision (Watiq.sql lines 835-868): the INSERT passes
    (slot_id, request_id, user_id, office_service_id, reason) and omits
    office_id. fn_appointments_derive_from_slot() sets NEW.office_id from the
    slot in a BEFORE INSERT trigger, which runs before the NOT NULL and
    composite FK checks, so fk_appointments_service_office never sees a stale
    client-supplied office — Backend.md §7.1 forbids trusting that input at
    all. office_service_id IS passed: the column is NOT NULL, and for an open
    slot (appointment_slots.office_service_id IS NULL) the trigger needs a
    non-NULL value to validate against office_services; for a service-bound
    slot the trigger overwrites it with the slot's own value, so the service
    rejects any mismatch up front. Overbooking is left to the DB: a full slot
    raises chk_appointment_slots_not_overbooked -> 409 slot_full.
    """
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    slot = await appointments_repo.get_slot(conn, data.slot_id)
    if slot is None:
        raise NotFound("slot_not_found")
    if not slot["is_active"]:
        raise BadRequest("slot_inactive")

    office_service_id = slot["office_service_id"]
    if office_service_id is not None:
        if data.office_service_id != office_service_id:
            raise BadRequest("service_does_not_match_slot")
    else:
        office_service_id = data.office_service_id

    appointment_id = await appointments_repo.insert_appointment(
        conn,
        slot_id=data.slot_id,
        request_id=data.request_id,
        user_id=principal.user_id,
        office_service_id=office_service_id,
        reason=data.reason,
    )
    await _notify_citizen(
        conn,
        user_id=principal.user_id,
        type_="appointment_confirmed",
        title="Appointment confirmed",
        message=(
            f"Your appointment on {slot['slot_date']} at {slot['time_slot']} "
            "is confirmed."
        ),
    )
    return {
        "id": appointment_id,
        "slot_id": data.slot_id,
        "request_id": data.request_id,
        "office_service_id": office_service_id,
        "status": "scheduled",
        "reason": data.reason,
    }


async def list_mine(
    conn: AsyncConnection, *, status: str | None, cursor: str | None,
    limit: int | None,
) -> dict[str, Any]:
    """Current user's appointments, keyset on (created_at, id) — RLS
    appointments_owner_select does the scoping."""
    cd = decode_cursor(cursor)
    size = page_size(limit)
    rows = await appointments_repo.list_mine(
        conn,
        status=status,
        cursor_created_at=cd.get("created_at"),
        cursor_id=cd.get("id"),
        limit=size + 1,
    )
    has_more = len(rows) > size
    items = rows[:size]
    next_cursor: str | None = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor(created_at=str(last["created_at"]), id=last["id"])
    return {"items": items, "next_cursor": next_cursor}


async def cancel(
    conn: AsyncConnection, principal: Principal, appointment_id: int,
) -> dict[str, Any]:
    """Citizen cancel: UPDATE ... WHERE status = 'scheduled'; the RLS policy
    appointments_owner_update scopes the row to the caller, and
    trg_appointments_slot_count (SECURITY DEFINER) decrements
    appointment_slots.booked_count — citizens hold only SELECT on slots, which
    is exactly why the counter lives in a trigger (Watiq.sql line 874)."""
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    row = await appointments_repo.cancel_mine(conn, appointment_id)
    if row is None:
        raise NotFound("appointment_not_found")
    await _notify_citizen(
        conn,
        user_id=principal.user_id,
        type_="appointment_cancelled",
        title="Appointment cancelled",
        message="Your appointment has been cancelled.",
    )
    return {"id": appointment_id, "status": "cancelled"}


async def list_office_day(
    conn: AsyncConnection, *, slot_date: date,
) -> list[dict[str, Any]]:
    """Office day view; appointments_staff_office RLS scopes it to the
    caller's office."""
    return await appointments_repo.list_office_day(conn, slot_date=slot_date)


async def create_slot(
    conn: AsyncConnection, principal: Principal, data: SlotCreateIn,
) -> dict[str, Any]:
    """Staff creates capacity. office_id comes from the principal's session,
    never from the body: appointment_slots has no RLS policy, so the office
    scope is applied here in the service instead (Watiq.sql §7a)."""
    if principal.office_id is None:
        raise Forbidden("staff_only")
    slot_id = await appointments_repo.insert_slot(
        conn,
        office_id=principal.office_id,
        office_service_id=data.office_service_id,
        slot_date=data.slot_date,
        time_slot=data.time_slot,
        capacity=data.capacity,
    )
    return {
        "id": slot_id,
        "office_id": principal.office_id,
        "office_service_id": data.office_service_id,
        "slot_date": data.slot_date,
        "time_slot": data.time_slot,
        "capacity": data.capacity,
        "is_active": True,
    }


async def deactivate_slot(
    conn: AsyncConnection, principal: Principal, slot_id: int,
) -> dict[str, Any]:
    """is_active = FALSE stops new bookings; existing ones stand."""
    if principal.office_id is None:
        raise Forbidden("staff_only")
    row = await appointments_repo.deactivate_slot(
        conn, slot_id=slot_id, office_id=principal.office_id
    )
    if row is None:
        raise NotFound("slot_not_found")
    return {"id": slot_id, "is_active": False}


async def set_status_staff(
    conn: AsyncConnection, principal: Principal, appointment_id: int,
    status: str,
) -> dict[str, Any]:
    """Staff closes a visit as 'completed' or 'no_show' — a citizen's own
    update is restricted to cancel (chk_appointments_status)."""
    row = await appointments_repo.set_status_staff(
        conn, appointment_id=appointment_id, status=status
    )
    if row is None:
        raise NotFound("appointment_not_found")
    return {"id": appointment_id, "status": status}


async def _notify_citizen(
    conn: AsyncConnection, *, user_id: int, type_: str, title: str, message: str,
) -> None:
    """Enqueue a notification via the notifications module (Backend.md §10).

    Lazy import: notifications is a leaf module; importing it at module top
    would make the import graph order-dependent (Structure.md §4). Contract:
    notifications.service.notify(conn, *, user_id, type, title, message).
    """
    from app.modules.notifications import service as notifications_service

    await notifications_service.notify(
        conn, user_id=user_id, type=type_, title=title, message=message
    )
