"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Every statement here runs inside the caller's RLS transaction. `appointments`
rows are scoped by the appointments_* RLS policies; `appointment_slots` has no
RLS (Watiq.sql §7a enables it selectively), so slot queries carry their own
office scope where the actor's identity cannot be inferred from the GUCs.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_LIST_AVAILABLE_SLOTS = text(
    """
    SELECT sl.id, sl.office_id, o.name AS office_name, o.governorate,
           sl.office_service_id, sl.slot_date, sl.time_slot, sl.capacity,
           sl.booked_count, sl.capacity - sl.booked_count AS seats_left
      FROM appointment_slots sl
      JOIN offices o ON o.id = sl.office_id
     WHERE sl.office_id = :office_id
       AND sl.is_active = TRUE
       AND sl.booked_count < sl.capacity
       AND sl.slot_date = :slot_date
       AND (:service_id::INTEGER IS NULL OR sl.office_service_id = :service_id)
     ORDER BY sl.slot_date, sl.time_slot
    """
)

_GET_SLOT = text(
    """
    SELECT id, office_id, office_service_id, slot_date, time_slot,
           capacity, booked_count, is_active
      FROM appointment_slots
     WHERE id = :slot_id
    """
)

_INSERT_APPOINTMENT = text(
    """
    -- office_id is deliberately absent: fn_appointments_derive_from_slot()
    -- fills it from the slot in a BEFORE INSERT trigger, which runs before
    -- the NOT NULL and composite-FK checks, so no FK can see a stale
    -- client-supplied office. office_service_id IS provided: the column is
    -- NOT NULL, and for an open slot the trigger needs it to validate the
    -- service against the office (Watiq.sql §6, Backend.md §7.1).
    INSERT INTO appointments (slot_id, request_id, user_id,
                              office_service_id, reason)
    VALUES (:slot_id, :request_id, :user_id,
            :office_service_id, :reason)
    RETURNING id
    """
)

_LIST_MY = text(
    """
    SELECT a.id, a.slot_id, a.request_id, a.user_id, a.office_id,
           a.office_service_id, a.status, a.queue_number, a.reason,
           a.created_at, sl.slot_date, sl.time_slot
      FROM appointments a
      JOIN appointment_slots sl ON sl.id = a.slot_id
     WHERE (:cursor_created_at::timestamptz IS NULL
            OR (a.created_at, a.id) < (:cursor_created_at, :cursor_id))
       AND (:status::VARCHAR IS NULL OR a.status = :status)
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT :limit
    """
)

_CANCEL_MY = text(
    """
    -- appointments_owner_update scopes the row to the caller and to the
    -- 'scheduled' state; trg_appointments_slot_count (SECURITY DEFINER)
    -- decrements booked_count, which citizens could never do directly.
    UPDATE appointments SET status = 'cancelled'
     WHERE id = :appointment_id AND status = 'scheduled'
    RETURNING id
    """
)

_LIST_OFFICE_DAY = text(
    """
    SELECT a.id, a.slot_id, a.request_id, a.user_id, a.office_id,
           a.office_service_id, a.status, a.queue_number, a.reason,
           a.created_at, sl.slot_date, sl.time_slot
      FROM appointments a
      JOIN appointment_slots sl ON sl.id = a.slot_id
     WHERE sl.slot_date = :slot_date
     ORDER BY sl.time_slot, a.created_at
    """
)

_INSERT_SLOT = text(
    """
    INSERT INTO appointment_slots (office_id, office_service_id, slot_date,
                                   time_slot, capacity)
    VALUES (:office_id, :office_service_id, :slot_date, :time_slot, :capacity)
    RETURNING id
    """
)

_DEACTIVATE_SLOT = text(
    """
    -- No RLS on appointment_slots: the office scope lives in this WHERE
    -- clause, mirroring fn_appointments_derive_from_slot's office binding.
    UPDATE appointment_slots SET is_active = FALSE
     WHERE id = :slot_id AND office_id = :office_id
    RETURNING id
    """
)

_SET_STATUS_STAFF = text(
    """
    -- appointments_staff_office scopes the row to the caller's office;
    -- chk_appointments_status guards the value. Only 'scheduled' rows are
    -- touchable, so completed/no_show can never double-apply.
    UPDATE appointments SET status = :status
     WHERE id = :appointment_id AND status = 'scheduled'
    RETURNING id
    """
)


async def list_available_slots(
    conn: AsyncConnection, *, office_id: int, service_id: int | None,
    slot_date: date,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _LIST_AVAILABLE_SLOTS,
            {"office_id": office_id, "service_id": service_id, "slot_date": slot_date},
        )
    ).all()
    return [dict(r) for r in rows]


async def get_slot(conn: AsyncConnection, slot_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_SLOT, {"slot_id": slot_id})).first()
    return dict(row) if row else None


async def insert_appointment(
    conn: AsyncConnection, *, slot_id: int, request_id: int | None,
    user_id: int, office_service_id: int, reason: str | None,
) -> int:
    row = (
        await conn.execute(
            _INSERT_APPOINTMENT,
            {
                "slot_id": slot_id,
                "request_id": request_id,
                "user_id": user_id,
                "office_service_id": office_service_id,
                "reason": reason,
            },
        )
    ).first()
    return int(row.id) if row else 0


async def list_mine(
    conn: AsyncConnection, *, status: str | None,
    cursor_created_at: str | None, cursor_id: Any | None, limit: int,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _LIST_MY,
            {
                "status": status,
                "cursor_created_at": cursor_created_at,
                "cursor_id": cursor_id,
                "limit": limit,
            },
        )
    ).all()
    return [dict(r) for r in rows]


async def cancel_mine(conn: AsyncConnection, appointment_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_CANCEL_MY, {"appointment_id": appointment_id})).first()
    return dict(row) if row else None


async def list_office_day(
    conn: AsyncConnection, *, slot_date: date,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(_LIST_OFFICE_DAY, {"slot_date": slot_date})
    ).all()
    return [dict(r) for r in rows]


async def insert_slot(
    conn: AsyncConnection, *, office_id: int, office_service_id: int | None,
    slot_date: date, time_slot: str, capacity: int,
) -> int:
    row = (
        await conn.execute(
            _INSERT_SLOT,
            {
                "office_id": office_id,
                "office_service_id": office_service_id,
                "slot_date": slot_date,
                "time_slot": time_slot,
                "capacity": capacity,
            },
        )
    ).first()
    return int(row.id) if row else 0


async def deactivate_slot(
    conn: AsyncConnection, *, slot_id: int, office_id: int,
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _DEACTIVATE_SLOT, {"slot_id": slot_id, "office_id": office_id}
        )
    ).first()
    return dict(row) if row else None


async def set_status_staff(
    conn: AsyncConnection, *, appointment_id: int, status: str,
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _SET_STATUS_STAFF,
            {"appointment_id": appointment_id, "status": status},
        )
    ).first()
    return dict(row) if row else None
