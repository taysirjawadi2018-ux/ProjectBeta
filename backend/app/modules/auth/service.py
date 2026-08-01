"""Authentication business rules (Backend.md §6, ADR-005).

Services never touch HTTP; the ARQ workers call these same functions.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pyotp
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import security as sec
from app.core.crypto import decrypt_mfa_secret, encrypt_mfa_secret
from app.core.errors import BadRequest, NotFound, Unauthorized
from app.core.security import mint_access_token, verify_password
from app.modules.auth import repository as auth_repo
from app.modules.auth.exceptions import AccountLocked, InvalidCredentials
from app.modules.auth.schemas import RegisterIn

log = structlog.get_logger("watiq.auth")

LOGIN_FAILURES_TO_LOCK = 5
LOCKOUT_MINUTES = 15
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
REFRESH_TTL_DAYS = 14


@dataclass(frozen=True, slots=True)
class TokenPair:
    access: str
    refresh: str
    mfa_required: bool = False


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _new_refresh() -> str:
    return secrets.token_urlsafe(32)

_SESSION_BY_ID = text(
    """
    SELECT id, user_id, staff_id, mfa_satisfied, expires_at, revoked_at
      FROM sessions
     WHERE id = :session_id
    """
)

_STAFF_EMAIL_BY_ID = text("SELECT email FROM staff WHERE id = :staff_id")


async def _session_by_id(conn: AsyncConnection, session_id: str) -> dict[str, Any] | None:
    row = (await conn.execute(_SESSION_BY_ID, {"session_id": session_id})).first()
    return dict(row._mapping) if row else None


async def _staff_email_by_id(conn: AsyncConnection, staff_id: int | None) -> str:
    if staff_id is None:
        return ""
    row = (await conn.execute(_STAFF_EMAIL_BY_ID, {"staff_id": staff_id})).first()
    if row is None:
        raise NotFound("staff_not_found")
    return str(row.email)


async def _staff_claims(conn: AsyncConnection, staff_id: int, mfa: bool) -> dict[str, Any]:
    staff = await auth_repo.find_staff_by_email(conn, await _staff_email_by_id(conn, staff_id))
    if staff is None:
        raise Unauthorized("invalid_session")
    return {
        "typ": "staff",
        "sub": staff.id,
        "office": staff.office_id,
        "role": staff.role_code,
        "perms": staff.permissions,
        "mfa": mfa,
    }


def _citizen_claims(user_id: int) -> dict[str, Any]:
    return {"typ": "citizen", "sub": user_id}


async def rotate_refresh(
    conn: AsyncConnection, presented: str, ip: str, ua: str
) -> TokenPair:
    """Opaque refresh rotation with reuse detection (Backend.md §6.3).

    The schema stores only SHA-256 hashes; presenting an already-rotated or
    revoked token is proof of theft and burns the whole session family.
    """
    row = await auth_repo.find_session_by_refresh_hash(conn, _hash_refresh(presented))
    if row is None:
        raise Unauthorized("invalid_refresh_token")

    if row.revoked_at is not None:
        await auth_repo.revoke_all_sessions_for(
            conn, user_id=row.user_id, staff_id=row.staff_id,
            reason="token_reuse_detected",
        )
        log.warning("refresh_token_reuse", session_id=row.id, ip=ip)
        raise Unauthorized("invalid_refresh_token")

    if row.expires_at <= datetime.now(UTC):
        raise Unauthorized("expired_refresh_token")

    new_refresh = _new_refresh()
    await auth_repo.revoke_session(conn, row.id, reason="rotated")
    new_session_id = await auth_repo.create_session(
        conn,
        user_id=row.user_id,
        staff_id=row.staff_id,
        refresh_token_hash=_hash_refresh(new_refresh),
        mfa_satisfied=row.mfa_satisfied,
        ip_address=ip,
        user_agent=ua,
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TTL_DAYS),
    )
    if row.staff_id is not None:
        claims = await _staff_claims(conn, row.staff_id, row.mfa_satisfied)
    elif row.user_id is not None:      # chk_sessions_one_principal
        claims = _citizen_claims(row.user_id)
    else:
        raise Unauthorized("invalid_session")
    return TokenPair(
        access=mint_access_token(
            typ=claims["typ"], sub=claims["sub"], session_id=new_session_id,
            office_id=claims.get("office"), permissions=claims.get("perms", frozenset()),
            mfa_satisfied=row.mfa_satisfied,
        ),
        refresh=new_refresh,
    )


async def logout(conn: AsyncConnection, session_id: str) -> None:
    await auth_repo.revoke_session(conn, session_id, reason="logout")


async def login_citizen(
    conn: AsyncConnection, login: str, password: str,
    ip: str, ua: str, device_label: str | None,
) -> TokenPair:
    """Citizen password login with identical failure responses for
    'no such user' and 'wrong password' (Backend.md §6.5)."""
    user = await auth_repo.find_user_by_login(conn, login)
    if user is None or user["anonymized_at"] is not None or not user["is_active"]:
        verify_password(password, None)   # burn the same CPU either way
        raise InvalidCredentials()

    if user["locked_until"] and user["locked_until"] > datetime.now(UTC):
        raise AccountLocked()

    ok, _new_hash = verify_password(password, user["password_hash"])
    if not ok:
        await auth_repo.inc_user_login_failures(conn, user["id"])
        raise InvalidCredentials()

    await auth_repo.reset_user_login_state(conn, user["id"])
    refresh = _new_refresh()
    session_id = await auth_repo.create_session(
        conn,
        user_id=user["id"],
        staff_id=None,
        refresh_token_hash=_hash_refresh(refresh),
        mfa_satisfied=False,
        ip_address=ip,
        user_agent=ua,
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TTL_DAYS),
    )
    return TokenPair(
        access=mint_access_token(
            typ="citizen", sub=user["id"], session_id=session_id, mfa_satisfied=False,
        ),
        refresh=refresh,
    )


async def login_staff(
    conn: AsyncConnection, email: str, password: str,
    ip: str, ua: str, device_label: str | None,
) -> TokenPair:
    """Staff login. MFA-enabled staff get a partial session and must complete
    a TOTP challenge before any PII-touching endpoint (Backend.md §6.4)."""
    staff = await auth_repo.find_staff_by_email(conn, email)
    if staff is None or not staff.is_active:
        verify_password(password, None)
        raise InvalidCredentials()

    if staff.locked_until and staff.locked_until > datetime.now(UTC):
        raise AccountLocked()

    ok, _new_hash = verify_password(password, staff.password_hash)
    if not ok:
        await auth_repo.inc_staff_login_failures(conn, staff.id)
        raise InvalidCredentials()

    await auth_repo.reset_staff_login_state(conn, staff.id)

    mfa_ok = not staff.mfa_enabled
    refresh = _new_refresh()
    session_id = await auth_repo.create_session(
        conn,
        user_id=None,
        staff_id=staff.id,
        refresh_token_hash=_hash_refresh(refresh),
        mfa_satisfied=mfa_ok,
        ip_address=ip,
        user_agent=ua,
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TTL_DAYS),
    )
    return TokenPair(
        access=mint_access_token(
            typ="staff", sub=staff.id, session_id=session_id,
            office_id=staff.office_id, permissions=frozenset(staff.permissions),
            mfa_satisfied=mfa_ok,
        ),
        refresh=refresh,
        mfa_required=not mfa_ok,
    )


async def register_citizen(conn: AsyncConnection, data: RegisterIn) -> int:
    """Create a citizen account. Any pre-existing row for the same
    national_id/email/phone surfaces as a unique-violation 409 via
    CONSTRAINT_ERRORS — never as a 'user exists' oracle on this endpoint."""
    return await auth_repo.create_user(
        conn,
        national_id=data.national_id,
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        phone=data.phone,
        password_hash=sec.hash_password(data.password),
        date_of_birth=data.date_of_birth,
        governorate=data.governorate,
        city=data.city,
    )


async def issue_otp(
    conn: AsyncConnection, *, purpose: str, user_id: int | None = None,
    staff_id: int | None = None, channel: str, destination: str, ip: str,
) -> None:
    """Create an OTP for email/phone verification, password reset, or staff
    login step-up. The partial unique indexes enforce one live code per
    principal per purpose; the caller must consume the old one first."""
    old = await auth_repo.find_live_code(
        conn, purpose=purpose, user_id=user_id, staff_id=staff_id
    )
    if old is not None:
        await auth_repo.consume_code(conn, old["id"])

    code = f"{secrets.randbelow(1_000_000):06d}"
    await auth_repo.insert_verification_code(
        conn,
        user_id=user_id,
        staff_id=staff_id,
        purpose=purpose,
        channel=channel,
        destination=destination,
        code_hash=_hash_otp(code),
        expires_at=datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES),
        ip_address=ip,
    )
    # The channel is out of scope here: the notifications worker enqueues the
    # send. This keeps SMS/email out of the request path (Backend.md §10).
    log.info("otp_issued", purpose=purpose, channel=channel)


async def verify_otp(
    conn: AsyncConnection, *, code: str, purpose: str,
    user_id: int | None = None, staff_id: int | None = None,
) -> None:
    live = await auth_repo.find_live_code(
        conn, purpose=purpose, user_id=user_id, staff_id=staff_id
    )
    if live is None:
        raise BadRequest("This code is invalid or has expired.")

    if live["attempt_count"] >= live["max_attempts"]:
        await auth_repo.consume_code(conn, live["id"])
        raise BadRequest("Too many attempts for this code.")

    if not secrets.compare_digest(live["code_hash"], _hash_otp(code)):
        await auth_repo.bump_code_attempts(conn, live["id"])
        raise BadRequest("This code is invalid or has expired.")

    await auth_repo.consume_code(conn, live["id"])


async def find_code_for_reset(
    conn: AsyncConnection, code: str
) -> dict[str, Any] | None:
    """The verification_codes row carries the destination address; the reset
    endpoint needs it to pick the account. Timing: hash lookup only."""
    return await auth_repo.find_live_code_by_hash(
        conn, purpose="password_reset", code_hash=_hash_otp(code)
    )


async def reset_password_by_destination(
    conn: AsyncConnection, destination: str, new_password: str
) -> None:
    """Set a new password on the account whose email/phone the code went to.
    Invalidates every live session for that user (revoked_reason vocabulary
    from Backend.md §6.3)."""
    from sqlalchemy import text

    row = (
        await conn.execute(
            text("SELECT id FROM users WHERE email = :d OR phone = :d"),
            {"d": destination},
        )
    ).first()
    if row is None:
        raise NotFound("user_not_found")
    await conn.execute(
        text("UPDATE users SET password_hash = :h, failed_login_attempts = 0, "
             "locked_until = NULL WHERE id = :uid"),
        {"h": sec.hash_password(new_password), "uid": row.id},
    )
    await auth_repo.revoke_all_sessions_for(
        conn, user_id=row.id, reason="password_change"
    )


async def complete_staff_mfa(
    conn: AsyncConnection, session_id: str, code: str,
) -> TokenPair:
    """TOTP (preferred) or recovery-code step-up for a partial staff session.

    Returns a fresh token pair with mfa_satisfied=TRUE. Rotates the refresh
    token so the partial pair dies and reuse detection still holds.
    """
    session = await _session_by_id(conn, session_id)
    if session is None or session["staff_id"] is None:
        raise Unauthorized("invalid_session")
    if session["revoked_at"] is not None:
        raise Unauthorized("invalid_session")

    staff = await auth_repo.find_staff_by_email(
        conn, await _staff_email_by_id(conn, session["staff_id"])
    )
    if staff is None:
        raise Unauthorized("invalid_session")

    if staff.mfa_enabled and staff.mfa_secret:
        secret = decrypt_mfa_secret(staff.mfa_secret)
        if not pyotp.TOTP(secret).verify(code, valid_window=1):
            raise Unauthorized("invalid_mfa_code")
    else:
        recovery = await auth_repo.find_live_recovery_code(conn, staff.id)
        if recovery is None or not secrets.compare_digest(
            recovery["code_hash"], _hash_otp(code)
        ):
            raise Unauthorized("invalid_mfa_code")
        await auth_repo.use_recovery_code(conn, recovery["id"])

    await auth_repo.mark_session_mfa(conn, session_id)

    new_refresh = _new_refresh()
    await auth_repo.revoke_session(conn, session_id, reason="rotated")
    new_session_id = await auth_repo.create_session(
        conn,
        user_id=None,
        staff_id=staff.id,
        refresh_token_hash=_hash_refresh(new_refresh),
        mfa_satisfied=True,
        ip_address="",
        user_agent="",
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TTL_DAYS),
    )
    return TokenPair(
        access=mint_access_token(
            typ="staff", sub=staff.id, session_id=new_session_id,
            office_id=staff.office_id, permissions=frozenset(staff.permissions),
            mfa_satisfied=True,
        ),
        refresh=new_refresh,
    )


async def enroll_staff_mfa(
    conn: AsyncConnection, staff_id: int,
) -> dict[str, Any]:
    """Generate a TOTP secret, store it AES-256-GCM encrypted (the schema
    forbids plaintext), return the provisioning URI and recovery codes."""
    secret = pyotp.random_base32()
    await auth_repo.set_staff_mfa(
        conn, staff_id=staff_id, enabled=True,
        mfa_secret=encrypt_mfa_secret(secret),
    )
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=f"watiq:{staff_id}", issuer_name="Watiq"
    )
    codes = [f"{secrets.randbelow(10**12):012d}" for _ in range(10)]
    for code in codes:
        await auth_repo.insert_recovery_code(
            conn, staff_id=staff_id, code_hash=_hash_otp(code)
        )
    return {"otpauth_uri": uri, "recovery_codes": codes}


async def disable_staff_mfa(conn: AsyncConnection, staff_id: int) -> None:
    await auth_repo.set_staff_mfa(conn, staff_id=staff_id, enabled=False, mfa_secret=None)
    await auth_repo.clear_recovery_codes(conn, staff_id)
