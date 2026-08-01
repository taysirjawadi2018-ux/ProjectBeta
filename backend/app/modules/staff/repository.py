"""SQL only (Structure.md §3). Staff self-service on the STAFF engine.

RLS `staff_same_office` scopes every SELECT to the caller's office, and the
column-level GRANT to watiq_staff (Watiq.sql §7b) excludes password_hash,
mfa_secret and mfa_enabled — so those columns are never selected here.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_GET_ME = text(
    """
    SELECT s.id, s.office_id, s.role_id, s.name, s.email, s.is_active,
           s.last_login_at, s.created_at,
           r.code AS role_code, r.name AS role_name,
           o.name AS office_name
      FROM staff s
      JOIN roles r ON r.id = s.role_id
      JOIN offices o ON o.id = s.office_id
     WHERE s.id = :staff_id
    """
)

_LIST_PERMISSIONS = text(
    """
    SELECT p.code
      FROM staff s
      JOIN role_permissions rp ON rp.role_id = s.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE s.id = :staff_id
     ORDER BY p.code
    """
)

_LIST_OFFICE_STAFF = text(
    """
    SELECT s.id, s.name, s.email, r.name AS role_name, s.is_active
      FROM staff s
      JOIN roles r ON r.id = s.role_id
     WHERE s.office_id = :office_id
     ORDER BY s.name
    """
)


async def get_me(conn: AsyncConnection, staff_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_ME, {"staff_id": staff_id})).first()
    return dict(row) if row else None


async def list_permissions(conn: AsyncConnection, staff_id: int) -> list[str]:
    rows = (await conn.execute(_LIST_PERMISSIONS, {"staff_id": staff_id})).all()
    return [str(r.code) for r in rows]


async def list_office_staff(conn: AsyncConnection, office_id: int) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_OFFICE_STAFF, {"office_id": office_id})).all()
    return [dict(r) for r in rows]
