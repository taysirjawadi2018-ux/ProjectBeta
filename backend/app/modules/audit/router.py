"""HTTP only: auditor endpoints (Structure.md §3).

Reads run on the watiq_auditor engine (AuditorConn), whose USING (TRUE)
policies see every office. The engine is powerful, so the endpoint is not:
Layer 2 still demands an MFA-satisfied staff principal holding audit.view.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import AuditorConn, require_mfa, require_permission
from app.core.pagination import page_size
from app.core.principal import Principal
from app.modules.audit import service
from app.modules.audit.schemas import AccessLogPageOut, CitizenHistoryOut, StaffActivityOut

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("/access-log", response_model=AccessLogPageOut)
async def access_log(
    conn: AuditorConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("audit.view"))],
    user_id: int | None = None,
    staff_id: int | None = None,
    resource_type: str | None = None,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    """Filtered audit trail, keyset-paginated on (occurred_at, id) DESC.
    query_params (search filters, not form payloads) is returned as-is."""
    return await service.list_access_log(
        conn,
        user_id=user_id,
        staff_id=staff_id,
        resource_type=resource_type,
        from_=from_,
        to=to,
        cursor=cursor,
        limit=page_size(limit),
    )


@router.get("/users/{user_id}/history", response_model=CitizenHistoryOut)
async def user_history(
    user_id: int,
    conn: AuditorConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("audit.view"))],
) -> Any:
    """Everything about one citizen: requests + access_log + status_history."""
    return await service.user_history(conn, user_id)


@router.get("/staff/{staff_id}/activity", response_model=StaffActivityOut)
async def staff_activity(
    staff_id: int,
    conn: AuditorConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("audit.view"))],
) -> Any:
    """All access_log rows attributed to one staff member."""
    return await service.staff_activity(conn, staff_id)
