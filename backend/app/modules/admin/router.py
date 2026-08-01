"""HTTP only: administrator back-office endpoints (Structure.md §3).

Every handler runs on the watiq_admin engine (AdminConn): all admin RLS
policies are USING (TRUE) WITH CHECK (TRUE), so Layer 2 — require_mfa plus a
permission gate — is the endpoint-level authorization.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import AdminConn, require_mfa, require_permission
from app.core.pagination import page_size
from app.core.principal import Principal
from app.modules.admin import service
from app.modules.admin.schemas import (
    AdminUserPageOut,
    AnonymizeIn,
    DeactivateIn,
    PermissionsUpdateIn,
    StaffCreateIn,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserPageOut)
async def search_users(
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("user.view"))],
    query: str | None = Query(default=None, max_length=255),
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    """Search users by national_id/email/phone/name, keyset-paginated on id."""
    return await service.search_users(
        conn, query=query, cursor=cursor, limit=page_size(limit),
    )


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: int,
    body: DeactivateIn,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("user.deactivate"))],
) -> Any:
    await service.deactivate_citizen(conn, user_id=user_id, reason=body.reason)
    return {"id": user_id, "is_active": False}


@router.post("/users/{user_id}/reactivate")
async def reactivate_user(
    user_id: int,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("user.deactivate"))],
) -> Any:
    await service.reactivate_citizen(conn, user_id)
    return {"id": user_id, "is_active": True}


@router.post("/users/{user_id}/anonymize")
async def anonymize_user(
    user_id: int,
    body: AnonymizeIn,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("user.anonymize"))],
) -> Any:
    await service.anonymize_citizen(
        conn, actor_staff_id=_mfa.staff_id, user_id=user_id, reason=body.reason,
    )
    return {"id": user_id, "anonymized": True}


@router.get("/staff")
async def list_staff(
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("staff.manage"))],
) -> Any:
    """All staff with office and role names. password_hash/mfa_secret are
    never projected (the admin schema has no such fields either)."""
    return {"staff": await service.list_staff(conn)}


@router.post("/staff", status_code=201)
async def create_staff(
    body: StaffCreateIn,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("staff.manage"))],
) -> Any:
    """Create a staff account; role_code resolves to role_id, password is
    hashed via app.core.security (staff_admin RLS permits the insert)."""
    return await service.create_staff(conn, body)


@router.post("/staff/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: int,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("staff.manage"))],
) -> Any:
    await service.deactivate_staff(conn, staff_id)
    return {"id": staff_id, "is_active": False}


@router.post("/staff/{staff_id}/reactivate")
async def reactivate_staff(
    staff_id: int,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("staff.manage"))],
) -> Any:
    await service.reactivate_staff(conn, staff_id)
    return {"id": staff_id, "is_active": True}


@router.get("/roles")
async def list_roles(
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("role.manage"))],
) -> Any:
    """Role catalogue for the admin UI (populates role_code on staff create)."""
    return {"roles": await service.list_roles(conn)}


@router.patch("/roles/{role_id}/permissions")
async def update_role_permissions(
    role_id: int,
    body: PermissionsUpdateIn,
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("role.manage"))],
) -> Any:
    """Replace a role's permission set — the RBAC surface. These grants are
    what fn_staff_has_permission() (and the RLS policies) consult."""
    return await service.update_role_permissions(
        conn, role_id=role_id, permission_codes=body.permission_codes,
    )


@router.get("/permissions")
async def list_permissions(
    conn: AdminConn,
    _mfa: Annotated[Principal, Depends(require_mfa)],
    _perm: Annotated[Principal, Depends(require_permission("role.manage"))],
) -> Any:
    """All permission codes, for the RBAC admin UI."""
    return {"permissions": await service.list_permissions(conn)}
