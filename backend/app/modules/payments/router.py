"""HTTP only: payment paths, status codes, dependencies (Structure.md §3).

Citizens hold SELECT only on payments (Watiq.sql line 1418): the API exposes
reads for them, a staff/auditor filtered view, and the write path lives in the
ARQ `reconcile_payments` job (Backend.md §10) — see service.py.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbConn, require_mfa, require_permission
from app.core.errors import Unauthorized
from app.core.principal import Principal
from app.modules.payments import service
from app.modules.payments.schemas import PaymentListOut, PaymentOut

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.get("", response_model=PaymentListOut)
async def list_mine(
    conn: DbConn,
    principal: CurrentUser,
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await service.list_my(conn, cursor=cursor, limit=limit)


@router.get("/office", response_model=PaymentListOut)
async def office_payments(
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("payment.view"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
    status: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    return await service.list_filtered(
        conn, principal, status=status, cursor=cursor, limit=limit
    )


@router.get("/{payment_id}", response_model=PaymentOut)
async def get_one(
    payment_id: int, conn: DbConn, principal: CurrentUser,
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await service.get_one(conn, principal, payment_id)
