"""SQL only (Structure.md §3). Back-office operations on the watiq_admin engine.

watiq_admin holds table-level SELECT/INSERT/UPDATE/DELETE (Watiq.sql §7b) and
every admin RLS policy is USING (TRUE) WITH CHECK (TRUE), so these statements
are structurally unfettered — Layer 2 (require_mfa + require_permission) is
what gates the endpoints.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_SEARCH_USERS = text(
    """
    SELECT id, national_id, first_name, last_name, email, phone,
           is_active, deactivated_at, deactivation_reason,
           anonymized_at, created_at
      FROM users
     WHERE (CAST(:query AS text) IS NULL
            OR national_id::text ILIKE :query
            OR email::text ILIKE :query
            OR phone::text ILIKE :query
            OR first_name::text ILIKE :query
            OR last_name::text ILIKE :query)
       AND (CAST(:cursor_id AS bigint) IS NULL OR id < CAST(:cursor_id AS bigint))
     ORDER BY id DESC
     LIMIT :limit
    """
)

_DEACTIVATE_USER = text(
    """
    UPDATE users
       SET is_active = FALSE,
           deactivated_at = CURRENT_TIMESTAMP,
           deactivation_reason = :reason
     WHERE id = :user_id
    """
)

_REACTIVATE_USER = text(
    """
    UPDATE users
       SET is_active = TRUE,
           deactivated_at = NULL
     WHERE id = :user_id
    """
)

_ANONYMIZE_TARGET = text(
    """
    SELECT id, anonymized_at
      FROM users
     WHERE id = :user_id
    """
)

# fn_anonymize_user(p_user_id INTEGER, p_reason TEXT, p_actor_staff_id INTEGER)
# returns VOID; EXECUTE was revoked from PUBLIC and granted only to watiq_admin
# (Watiq.sql §7c/§8). The function itself raises on a missing or already
# anonymized user, so the service pre-checks with find_anonymize_target.
_ANONYMIZE_CALL = text("SELECT fn_anonymize_user(:uid, :reason, :actor)")

_STORAGE_KEYS_FOR_USER = text(
    """
    SELECT d.storage_key
      FROM documents d
      JOIN requests r ON r.id = d.request_id
     WHERE r.user_id = :user_id
    """
)

_REVOKE_SESSIONS = text(
    """
    UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = :reason
     WHERE revoked_at IS NULL
       AND (user_id = :user_id OR staff_id = :staff_id)
    """
)

_LIST_STAFF = text(
    """
    SELECT s.id, s.office_id, s.role_id, s.name, s.email, s.is_active,
           s.last_login_at, s.created_at,
           r.code AS role_code, r.name AS role_name,
           o.name AS office_name
      FROM staff s
      JOIN roles r ON r.id = s.role_id
      JOIN offices o ON o.id = s.office_id
     ORDER BY s.name
    """
)

_INSERT_STAFF = text(
    """
    INSERT INTO staff (office_id, role_id, name, email, password_hash)
    VALUES (:office_id, :role_id, :name, :email, :password_hash)
    RETURNING id
    """
)

_STAFF_BY_ID = text(
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

# updated_at is owned by trg_staff_updated_at; this statement only flips the flag.
_SET_STAFF_ACTIVE = text(
    """
    UPDATE staff SET is_active = :is_active WHERE id = :staff_id
    """
)

_LIST_ROLES = text(
    """
    SELECT id, code, name FROM roles ORDER BY sort_order, code
    """
)

_ROLE_BY_CODE = text(
    """
    SELECT id, code, name FROM roles WHERE code = :role_code
    """
)

_ROLE_BY_ID = text(
    """
    SELECT id, code, name FROM roles WHERE id = :role_id
    """
)

_DELETE_ROLE_PERMISSIONS = text(
    "DELETE FROM role_permissions WHERE role_id = :role_id"
)

_INSERT_ROLE_PERMISSION = text(
    """
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (:role_id, :permission_id)
    """
)

_LIST_PERMISSIONS = text(
    """
    SELECT id, code, name FROM permissions ORDER BY code
    """
)


async def search_users(
    conn: AsyncConnection, *, query: str | None, cursor_id: int | None, limit: int,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _SEARCH_USERS,
            {"query": query, "cursor_id": cursor_id, "limit": limit},
        )
    ).all()
    return [dict(r._mapping) for r in rows]


async def deactivate_user(conn: AsyncConnection, *, user_id: int, reason: str) -> bool:
    result = await conn.execute(_DEACTIVATE_USER, {"user_id": user_id, "reason": reason})
    return (result.rowcount or 0) > 0


async def reactivate_user(conn: AsyncConnection, user_id: int) -> bool:
    result = await conn.execute(_REACTIVATE_USER, {"user_id": user_id})
    return (result.rowcount or 0) > 0


async def find_anonymize_target(conn: AsyncConnection, user_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_ANONYMIZE_TARGET, {"user_id": user_id})).first()
    return dict(row._mapping) if row else None


async def anonymize_call(
    conn: AsyncConnection, *, user_id: int, reason: str, actor_staff_id: int | None,
) -> None:
    """SELECT fn_anonymize_user(:uid, :reason, :actor) — SECURITY DEFINER,
    watiq_admin only. Returns VOID; the function raises instead of returning
    a status for a missing/already-anonymized user."""
    await conn.execute(
        _ANONYMIZE_CALL,
        {"uid": user_id, "reason": reason, "actor": actor_staff_id},
    )


async def storage_keys_for_user(conn: AsyncConnection, user_id: int) -> list[str]:
    rows = (await conn.execute(_STORAGE_KEYS_FOR_USER, {"user_id": user_id})).all()
    return [str(r.storage_key) for r in rows]


async def revoke_sessions(
    conn: AsyncConnection, *, user_id: int | None = None,
    staff_id: int | None = None, reason: str,
) -> None:
    """Session revocation decision: implemented HERE as a direct UPDATE on
    sessions instead of auth.repository.revoke_all_sessions_for.

    Modules may only reach each other through service layers (Structure.md
    §3); auth has no service passthrough for this, and the auth module may
    not be edited. watiq_admin holds table-level UPDATE on sessions and the
    sessions_admin policy is USING (TRUE) WITH CHECK (TRUE) (Watiq.sql §7),
    so this statement is structurally permitted — the sanctioned path.
    revoked_reason uses the schema vocabulary (Backend.md §6.3): 'admin_revoke'
    for deactivation, 'offboarding' for staff, 'anonymization' for erasure.
    """
    await conn.execute(
        _REVOKE_SESSIONS,
        {"user_id": user_id, "staff_id": staff_id, "reason": reason},
    )


async def list_staff(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_STAFF)).all()
    return [dict(r._mapping) for r in rows]


async def insert_staff(
    conn: AsyncConnection, *, office_id: int, role_id: int, name: str,
    email: str, password_hash: str,
) -> int:
    row = (
        await conn.execute(
            _INSERT_STAFF,
            {
                "office_id": office_id,
                "role_id": role_id,
                "name": name,
                "email": email,
                "password_hash": password_hash,
            },
        )
    ).first()
    return int(row.id) if row else 0


async def get_staff_by_id(conn: AsyncConnection, staff_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_STAFF_BY_ID, {"staff_id": staff_id})).first()
    return dict(row._mapping) if row else None


async def set_staff_active(conn: AsyncConnection, *, staff_id: int, is_active: bool) -> bool:
    result = await conn.execute(
        _SET_STAFF_ACTIVE, {"staff_id": staff_id, "is_active": is_active}
    )
    return (result.rowcount or 0) > 0


async def list_roles(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_ROLES)).all()
    return [dict(r._mapping) for r in rows]


async def get_role_by_code(conn: AsyncConnection, role_code: str) -> dict[str, Any] | None:
    row = (await conn.execute(_ROLE_BY_CODE, {"role_code": role_code})).first()
    return dict(row._mapping) if row else None


async def get_role_by_id(conn: AsyncConnection, role_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_ROLE_BY_ID, {"role_id": role_id})).first()
    return dict(row._mapping) if row else None


async def replace_role_permissions(
    conn: AsyncConnection, *, role_id: int, permission_ids: list[int],
) -> None:
    """DELETE the role's grants, then INSERT the new set. Done row-by-row
    with scalar binds (no array/unnest typing tricks) — the permissions table
    is tiny, so the loop cost is irrelevant (Watiq.sql §10 seeds ~21 rows)."""
    await conn.execute(_DELETE_ROLE_PERMISSIONS, {"role_id": role_id})
    for permission_id in permission_ids:
        await conn.execute(
            _INSERT_ROLE_PERMISSION,
            {"role_id": role_id, "permission_id": permission_id},
        )


async def list_permissions(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_PERMISSIONS)).all()
    return [dict(r._mapping) for r in rows]
