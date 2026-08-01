"""HTTP only: appointment paths, status codes, dependencies (Structure.md §3).

No SQLAlchemy here. Citizen endpoints run on the caller's RLS transaction
(DbConn); staff endpoints additionally require the seeded permission codes
'appointment.view' / 'appointment.manage' / 'slot.manage' (Watiq.sql §2 seed)
plus MFA step-up.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbConn, require_mfa, require_permission
from app.core.errors import Unauthorized
from app.core.principal import Principal
from app.modules.appointments import service
from app.modules.appointments.schemas import (
    AppointmentCreateIn,
    AppointmentListOut,
    AppointmentOut,
    AppointmentStatusIn,
    SlotCreateIn,
    SlotOut,
)

router = APIRouter(prefix="/api/v1/appointments", tags=["appointments"])


@router.get("/slots", response_model=list[SlotOut])
async def list_slots(
    conn: DbConn,
    principal: CurrentUser,
    office_id: int,
    slot_date: date,
    service_id: int | None = None,
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await service.list_available_slots(
        conn, office_id=office_id, service_id=service_id, slot_date=slot_date
    )


@router.post("", status_code=201)
async def book_appointment(
    body: AppointmentCreateIn, conn: DbConn, principal: CurrentUser,
) -> Any:
    return await service.book(conn, principal, body)


@router.get("", response_model=AppointmentListOut)
async def list_mine(
    conn: DbConn,
    principal: CurrentUser,
    status: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await service.list_mine(conn, status=status, cursor=cursor, limit=limit)


@router.post("/{appointment_id}/cancel", response_model=AppointmentOut)
async def cancel_appointment(
    appointment_id: int, conn: DbConn, principal: CurrentUser,
) -> Any:
    return await service.cancel(conn, principal, appointment_id)


@router.get("/office", response_model=list[AppointmentOut])
async def office_day(
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("appointment.view"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
    slot_date: date,
) -> Any:
    return await service.list_office_day(conn, slot_date=slot_date)


@router.post("/slots", status_code=201)
async def create_slot(
    body: SlotCreateIn,
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("slot.manage"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    return await service.create_slot(conn, principal, body)


@router.post("/slots/{slot_id}/deactivate")
async def deactivate_slot(
    slot_id: int,
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("slot.manage"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    return await service.deactivate_slot(conn, principal, slot_id)


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def set_status(
    appointment_id: int,
    body: AppointmentStatusIn,
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("appointment.manage"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    return await service.set_status_staff(conn, principal, appointment_id, body.status)
