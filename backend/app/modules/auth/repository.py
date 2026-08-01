"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Every statement here runs inside the caller's RLS transaction, so identity
comes from the session GUCs, never from a WHERE clause the repository invents.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_FIND_SESSION_BY_REFRESH_HASH = text(
    """
    SELECT id, user_id, staff_id, mfa_satisfied, expires_at, revoked_at
      FROM sessions
     WHERE refresh_token_hash = :hash
    """
)

_REVOKE_SESSION = text(
    """
    UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = :reason
     WHERE id = :session_id
    """
)

_REVOKE_ALL_SESSIONS = text(
    """
    UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = :reason
     WHERE revoked_at IS NULL
       AND (user_id = :user_id OR staff_id = :staff_id)
    """
)

_INSERT_SESSION = text(
    """
    INSERT INTO sessions (user_id, staff_id, refresh_token_hash, mfa_satisfied,
                          ip_address, user_agent, expires_at)
    VALUES (:user_id, :staff_id, :refresh_token_hash, :mfa_satisfied,
            :ip_address, :user_agent, :expires_at)
    RETURNING id, issued_at
    """
)

_FIND_USER_BY_LOGIN = text(
    """
    SELECT id, password_hash, is_active, failed_login_attempts, locked_until,
           national_id, first_name, last_name, email, phone, email_verified,
           phone_verified, anonymized_at
      FROM users
     WHERE national_id = :login OR email = :login OR phone = :login
    """
)

_FIND_USER_BY_ID = text(
    """
    SELECT id, is_active, failed_login_attempts, locked_until, last_login_at
      FROM users
     WHERE id = :user_id
    """
)

_FIND_STAFF_BY_EMAIL = text(
    """
    SELECT s.id, s.office_id, s.role_id, s.name, s.email, s.password_hash,
           s.mfa_enabled, s.mfa_secret, s.is_active, s.failed_login_attempts,
           s.locked_until, r.code AS role_code,
           COALESCE((
               SELECT array_agg(p.code)
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = s.role_id
           ), '{}') AS permissions
      FROM staff s
      JOIN roles r ON r.id = s.role_id
     WHERE s.email = :email
    """
)

_INSERT_USER = text(
    """
    INSERT INTO users (national_id, first_name, last_name, email, phone,
                       password_hash, date_of_birth, governorate, city)
    VALUES (:national_id, :first_name, :last_name, :email, :phone,
            :password_hash, :date_of_birth, :governorate, :city)
    RETURNING id
    """
)

_INC_LOGIN_FAILURES = text(
    """
    UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
               WHEN failed_login_attempts + 1 >= 5
               THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
               ELSE locked_until
           END
     WHERE id = :user_id
    """
)

_RESET_LOGIN_STATE = text(
    """
    UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = CURRENT_TIMESTAMP
     WHERE id = :user_id
    """
)

_INC_STAFF_FAILURES = text(
    """
    UPDATE staff
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
               WHEN failed_login_attempts + 1 >= 5
               THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
               ELSE locked_until
           END
     WHERE id = :staff_id
    """
)

_RESET_STAFF_LOGIN_STATE = text(
    """
    UPDATE staff
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = CURRENT_TIMESTAMP
     WHERE id = :staff_id
    """
)

_INSERT_VERIFICATION_CODE = text(
    """
    -- One live code per principal per purpose (uq_verification_codes_active_*).
    -- Re-requesting supersedes: the caller consumes the old row first, then
    -- inserts; a race resolves in the partial unique index's favour as a
    -- UniqueViolationError which the service maps to 'try again'.
    INSERT INTO verification_codes
        (user_id, staff_id, purpose, channel, destination,
         code_hash, expires_at, ip_address)
    VALUES (:user_id, :staff_id, :purpose, :channel, :destination,
            :code_hash, :expires_at, :ip_address)
    RETURNING id
    """
)

_FIND_LIVE_CODE = text(
    """
    SELECT id, code_hash, attempt_count, max_attempts, expires_at
      FROM verification_codes
     WHERE consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND purpose = :purpose
       AND (user_id = :user_id OR staff_id = :staff_id)
    """
)

_FIND_LIVE_CODE_BY_HASH = text(
    """
    SELECT id, code_hash, attempt_count, max_attempts, expires_at, destination
      FROM verification_codes
     WHERE consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND purpose = :purpose
       AND code_hash = :code_hash
    """
)

_CONSUME_CODE = text(
    """
    UPDATE verification_codes SET consumed_at = CURRENT_TIMESTAMP
     WHERE id = :code_id
    """
)

_BUMP_CODE_ATTEMPTS = text(
    """
    UPDATE verification_codes SET attempt_count = attempt_count + 1
     WHERE id = :code_id
    """
)

_INSERT_RECOVERY_CODE = text(
    """
    INSERT INTO staff_recovery_codes (staff_id, code_hash)
    VALUES (:staff_id, :code_hash)
    """
)

_FIND_LIVE_RECOVERY_CODE = text(
    """
    SELECT id, code_hash
      FROM staff_recovery_codes
     WHERE staff_id = :staff_id AND used_at IS NULL
    """
)

_USE_RECOVERY_CODE = text(
    """
    UPDATE staff_recovery_codes SET used_at = CURRENT_TIMESTAMP
     WHERE id = :code_id
    """
)

_MARK_SESSION_MFA = text(
    """
    UPDATE sessions SET mfa_satisfied = TRUE, last_seen_at = CURRENT_TIMESTAMP
     WHERE id = :session_id
    """
)

_SET_STAFF_MFA = text(
    """
    UPDATE staff
       SET mfa_enabled = :enabled,
           mfa_secret = :mfa_secret,
           mfa_enrolled_at = CASE WHEN :enabled THEN CURRENT_TIMESTAMP
                                  ELSE mfa_enrolled_at END
     WHERE id = :staff_id
    """
)

_CLEAR_RECOVERY_CODES = text(
    """
    UPDATE staff_recovery_codes
       SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
     WHERE staff_id = :staff_id
    """
)


@dataclass(frozen=True, slots=True)
class SessionRow:
    id: str
    user_id: int | None
    staff_id: int | None
    mfa_satisfied: bool
    expires_at: datetime
    revoked_at: datetime | None


@dataclass(frozen=True, slots=True)
class StaffLoginRow:
    id: int
    office_id: int
    role_id: int
    name: str
    email: str
    password_hash: str
    mfa_enabled: bool
    mfa_secret: str | None
    is_active: bool
    failed_login_attempts: int
    locked_until: datetime | None
    role_code: str
    permissions: list[str]


async def find_session_by_refresh_hash(
    conn: AsyncConnection, refresh_hash: str,
) -> SessionRow | None:
    row = (await conn.execute(_FIND_SESSION_BY_REFRESH_HASH, {"hash": refresh_hash})).first()
    if row is None:
        return None
    return SessionRow(
        id=str(row.id),
        user_id=row.user_id,
        staff_id=row.staff_id,
        mfa_satisfied=bool(row.mfa_satisfied),
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
    )


async def revoke_session(conn: AsyncConnection, session_id: str, reason: str) -> None:
    await conn.execute(_REVOKE_SESSION, {"session_id": session_id, "reason": reason})


async def revoke_all_sessions_for(
    conn: AsyncConnection, *, user_id: int | None = None,
    staff_id: int | None = None, reason: str,
) -> None:
    await conn.execute(
        _REVOKE_ALL_SESSIONS,
        {"user_id": user_id, "staff_id": staff_id, "reason": reason},
    )


async def create_session(
    conn: AsyncConnection,
    *,
    refresh_token_hash: str,
    mfa_satisfied: bool,
    ip_address: str,
    user_agent: str,
    expires_at: datetime,
    user_id: int | None = None,
    staff_id: int | None = None,
) -> str:
    row = (
        await conn.execute(
            _INSERT_SESSION,
            {
                "user_id": user_id,
                "staff_id": staff_id,
                "refresh_token_hash": refresh_token_hash,
                "mfa_satisfied": mfa_satisfied,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "expires_at": expires_at,
            },
        )
    ).first()
    return str(row.id) if row else ""


async def find_user_by_login(conn: AsyncConnection, login: str) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _FIND_USER_BY_LOGIN, {"login": login}
        )
    ).first()
    return dict(row._mapping) if row else None


async def find_staff_by_email(conn: AsyncConnection, email: str) -> StaffLoginRow | None:
    row = (await conn.execute(_FIND_STAFF_BY_EMAIL, {"email": email})).first()
    if row is None:
        return None
    return StaffLoginRow(
        id=row.id,
        office_id=row.office_id,
        role_id=row.role_id,
        name=row.name,
        email=row.email,
        password_hash=row.password_hash,
        mfa_enabled=bool(row.mfa_enabled),
        mfa_secret=row.mfa_secret,
        is_active=bool(row.is_active),
        failed_login_attempts=row.failed_login_attempts,
        locked_until=row.locked_until,
        role_code=row.role_code,
        permissions=list(row.permissions or []),
    )


async def create_user(
    conn: AsyncConnection, *, national_id: str, first_name: str, last_name: str,
    email: str | None, phone: str | None, password_hash: str,
    date_of_birth: date | None, governorate: str | None, city: str | None,
) -> int:
    row = (
        await conn.execute(
            _INSERT_USER,
            {
                "national_id": national_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone": phone,
                "password_hash": password_hash,
                "date_of_birth": date_of_birth,
                "governorate": governorate,
                "city": city,
            },
        )
    ).first()
    return int(row.id) if row else 0


async def inc_user_login_failures(conn: AsyncConnection, user_id: int) -> None:
    await conn.execute(_INC_LOGIN_FAILURES, {"user_id": user_id})


async def reset_user_login_state(conn: AsyncConnection, user_id: int) -> None:
    await conn.execute(_RESET_LOGIN_STATE, {"user_id": user_id})


async def inc_staff_login_failures(conn: AsyncConnection, staff_id: int) -> None:
    await conn.execute(_INC_STAFF_FAILURES, {"staff_id": staff_id})


async def reset_staff_login_state(conn: AsyncConnection, staff_id: int) -> None:
    await conn.execute(_RESET_STAFF_LOGIN_STATE, {"staff_id": staff_id})


async def insert_verification_code(
    conn: AsyncConnection,
    *,
    user_id: int | None,
    staff_id: int | None,
    purpose: str,
    channel: str,
    destination: str,
    code_hash: str,
    expires_at: datetime,
    ip_address: str,
) -> None:
    await conn.execute(
        _INSERT_VERIFICATION_CODE,
        {
            "user_id": user_id,
            "staff_id": staff_id,
            "purpose": purpose,
            "channel": channel,
            "destination": destination,
            "code_hash": code_hash,
            "expires_at": expires_at,
            "ip_address": ip_address,
        },
    )


async def find_live_code(conn: AsyncConnection, *, purpose: str, user_id: int | None = None,
                         staff_id: int | None = None) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _FIND_LIVE_CODE,
            {"purpose": purpose, "user_id": user_id, "staff_id": staff_id},
        )
    ).first()
    return dict(row._mapping) if row else None


async def find_live_code_by_hash(
    conn: AsyncConnection, *, purpose: str, code_hash: str
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _FIND_LIVE_CODE_BY_HASH,
            {"purpose": purpose, "code_hash": code_hash},
        )
    ).first()
    return dict(row._mapping) if row else None


async def consume_code(conn: AsyncConnection, code_id: int) -> None:
    await conn.execute(_CONSUME_CODE, {"code_id": code_id})


async def bump_code_attempts(conn: AsyncConnection, code_id: int) -> None:
    await conn.execute(_BUMP_CODE_ATTEMPTS, {"code_id": code_id})


async def insert_recovery_code(conn: AsyncConnection, *, staff_id: int, code_hash: str) -> None:
    await conn.execute(_INSERT_RECOVERY_CODE, {"staff_id": staff_id, "code_hash": code_hash})


async def find_live_recovery_code(conn: AsyncConnection, staff_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_FIND_LIVE_RECOVERY_CODE, {"staff_id": staff_id})).first()
    return dict(row._mapping) if row else None


async def use_recovery_code(conn: AsyncConnection, code_id: int) -> None:
    await conn.execute(_USE_RECOVERY_CODE, {"code_id": code_id})


async def mark_session_mfa(conn: AsyncConnection, session_id: str) -> None:
    await conn.execute(_MARK_SESSION_MFA, {"session_id": session_id})


async def set_staff_mfa(
    conn: AsyncConnection, *, staff_id: int, enabled: bool,
    mfa_secret: str | None,
) -> None:
    await conn.execute(
        _SET_STAFF_MFA,
        {"staff_id": staff_id, "enabled": enabled, "mfa_secret": mfa_secret},
    )


async def clear_recovery_codes(conn: AsyncConnection, staff_id: int) -> None:
    await conn.execute(_CLEAR_RECOVERY_CODES, {"staff_id": staff_id})
