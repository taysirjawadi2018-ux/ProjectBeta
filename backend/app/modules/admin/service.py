"""Back-office business rules (Structure.md §3): SQL lives in repository.py.

Anonymization ordering (Backend.md §7.4): fn_anonymize_user deletes the
documents rows (and their storage keys) and strips the PII, so the keys must
be collected first; the blob deletion is best-effort, and session revocation
reason vocabulary is 'anonymization' (Backend.md §6.3).
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import BadRequest, Conflict, NotFound
from app.core.pagination import decode_cursor, encode_cursor
from app.modules.admin import repository as admin_repo
from app.modules.admin.exceptions import RoleNotFound
from app.modules.admin.schemas import StaffCreateIn

log = structlog.get_logger("watiq.admin")


async def search_users(
    conn: AsyncConnection, *, query: str | None, cursor: str | None, limit: int,
) -> dict[str, Any]:
    """Search users by national_id/email/phone/name (ILIKE), keyset-paginated
    on id DESC."""
    cursor_params = decode_cursor(cursor)
    q = f"%{query}%" if query else None
    rows = await admin_repo.search_users(
        conn, query=q, cursor_id=cursor_params.get("id"), limit=limit + 1,
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more and items:
        next_cursor = encode_cursor(id=items[-1]["id"])
    return {"items": items, "next_cursor": next_cursor}


async def deactivate_citizen(conn: AsyncConnection, *, user_id: int, reason: str) -> None:
    """Suspend a citizen account and burn every live session (revoked_reason
    'admin_revoke' — Backend.md §6.3)."""
    updated = await admin_repo.deactivate_user(conn, user_id=user_id, reason=reason)
    if not updated:
        raise NotFound("user_not_found")
    await admin_repo.revoke_sessions(conn, user_id=user_id, reason="admin_revoke")


async def reactivate_citizen(conn: AsyncConnection, user_id: int) -> None:
    updated = await admin_repo.reactivate_user(conn, user_id)
    if not updated:
        raise NotFound("user_not_found")


async def anonymize_citizen(
    conn: AsyncConnection, *, actor_staff_id: int | None, user_id: int, reason: str,
) -> None:
    """Execute a right-to-erasure request (Backend.md §7.4, Watiq.sql §8).

    Order: (1) collect the user's storage keys while the documents rows still
    exist; (2) call fn_anonymize_user(:uid, :reason, :actor) — the SECURITY
    DEFINER function (EXECUTE granted only to watiq_admin) nulls the PII,
    deletes the documents rows, writes the 'anonymize' access_log row and
    revokes sessions with revoked_reason='anonymization'; (3) delete the blob
    objects best-effort — a storage outage must not abort the erasure, so
    failures are logged and the transaction still commits; (4) revoke sessions
    once more as a belt-and-braces no-op (the function already did it).
    """
    target = await admin_repo.find_anonymize_target(conn, user_id)
    if target is None:
        raise NotFound("user_not_found")
    if target["anonymized_at"] is not None:
        raise Conflict("already_anonymized")

    keys = await admin_repo.storage_keys_for_user(conn, user_id)
    await admin_repo.anonymize_call(
        conn, user_id=user_id, reason=reason, actor_staff_id=actor_staff_id,
    )
    if keys:
        from app.core.storage import delete_objects

        try:
            await delete_objects(keys)
        except Exception:
            log.exception(
                "anonymize_storage_cleanup_failed", user_id=user_id, key_count=len(keys)
            )
    await admin_repo.revoke_sessions(conn, user_id=user_id, reason="anonymization")


async def list_staff(conn: AsyncConnection) -> list[dict[str, Any]]:
    return await admin_repo.list_staff(conn)


async def create_staff(conn: AsyncConnection, data: StaffCreateIn) -> dict[str, Any]:
    """Create a staff account: role_code is resolved to role_id, the password
    is hashed with the shared argon2 helper (never stored in the clear)."""
    role = await admin_repo.get_role_by_code(conn, data.role_code)
    if role is None:
        raise RoleNotFound()

    from app.core.security import hash_password

    staff_id = await admin_repo.insert_staff(
        conn,
        office_id=data.office_id,
        role_id=int(role["id"]),
        name=data.name,
        email=str(data.email),
        password_hash=hash_password(data.password),
    )
    return {"id": staff_id}


async def deactivate_staff(conn: AsyncConnection, staff_id: int) -> None:
    """Offboard a staff account and burn its live sessions ('offboarding')."""
    updated = await admin_repo.set_staff_active(conn, staff_id=staff_id, is_active=False)
    if not updated:
        raise NotFound("staff_not_found")
    await admin_repo.revoke_sessions(conn, staff_id=staff_id, reason="offboarding")


async def reactivate_staff(conn: AsyncConnection, staff_id: int) -> None:
    updated = await admin_repo.set_staff_active(conn, staff_id=staff_id, is_active=True)
    if not updated:
        raise NotFound("staff_not_found")


async def list_roles(conn: AsyncConnection) -> list[dict[str, Any]]:
    return await admin_repo.list_roles(conn)


async def update_role_permissions(
    conn: AsyncConnection, *, role_id: int, permission_codes: list[str],
) -> dict[str, Any]:
    """Replace a role's permission set. These grants are what
    fn_staff_has_permission() (and therefore the RLS policies) consult, so
    this is the RBAC admin surface — changes take effect on the next token
    mint (permissions ride in the JWT claims)."""
    role = await admin_repo.get_role_by_id(conn, role_id)
    if role is None:
        raise RoleNotFound()

    catalog = await admin_repo.list_permissions(conn)
    by_code = {p["code"]: int(p["id"]) for p in catalog}
    unknown = [code for code in permission_codes if code not in by_code]
    if unknown:
        raise BadRequest("unknown_permission_codes", codes=unknown)

    await admin_repo.replace_role_permissions(
        conn, role_id=role_id, permission_ids=[by_code[c] for c in permission_codes],
    )
    return {"role_id": role_id, "permission_codes": permission_codes}


async def list_permissions(conn: AsyncConnection) -> list[dict[str, Any]]:
    return await admin_repo.list_permissions(conn)
