"""Argon2id password hashing, EdDSA access tokens, CSRF helpers.

Backend.md §6.1-6.2, Security.md §8.4. Tokens are Ed25519 (JWT EdDSA); the
public key verifies against the current key AND the previous one so key
rotation never invalidates a live token (docs/runbooks/secret-rotation.md §2).
"""

from __future__ import annotations

import hmac
import secrets
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core.config import get_settings

_ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4,
                     hash_len=32, salt_len=16)

_DUMMY_HASH = _ph.hash("watiq-timing-equalizer")


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, stored: str | None) -> tuple[bool, str | None]:
    """Returns (ok, new_hash_if_rehash_needed).

    `stored` is None for anonymized accounts (fn_anonymize_user nulls
    password_hash). We still run a dummy verify so that timing does not
    distinguish 'no such user' from 'wrong password'.
    """
    if stored is None:
        with suppress(VerifyMismatchError, InvalidHashError):
            _ph.verify(_DUMMY_HASH, plain)   # burn the same CPU as a real check
        return False, None
    try:
        _ph.verify(stored, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False, None
    return True, (_ph.hash(plain) if _ph.check_needs_rehash(stored) else None)


def _private_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(
        serialization.load_pem_private_key(
            get_settings().jwt_private_key.get_secret_value().encode(),
            password=None,
        ).private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )


def _public_keys() -> list[Any]:
    s = get_settings()
    keys = [
        serialization.load_pem_public_key(s.jwt_public_key.get_secret_value().encode()),
    ]
    if s.jwt_public_key_previous is not None:
        keys.append(
            serialization.load_pem_public_key(
                s.jwt_public_key_previous.get_secret_value().encode()
            )
        )
    return keys


def mint_access_token(
    *,
    typ: str,                          # 'citizen' | 'staff'
    sub: int,
    session_id: str,
    office_id: int | None = None,
    permissions: frozenset[str] = frozenset(),
    mfa_satisfied: bool = False,
) -> str:
    """Mint a 15-minute EdDSA access token (Backend.md §6.2)."""
    s = get_settings()
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "typ": typ,
        "sub": sub,
        "sid": session_id,
        "mfa": mfa_satisfied,
        "iat": now,
        "exp": now + timedelta(seconds=s.access_token_ttl_seconds),
        "jti": secrets.token_urlsafe(16),
    }
    if typ == "staff":
        claims["office"] = office_id
        claims["perms"] = sorted(permissions)
    return jwt.encode(claims, _private_key(), algorithm="EdDSA")


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify and decode. Raises jwt.PyJWTError on any failure; the caller
    (deps.principal_from_token) turns that into a 401."""
    last_error: Exception | None = None
    for key in _public_keys():
        try:
            return jwt.decode(token, key, algorithms=["EdDSA"])
        except jwt.PyJWTError as exc:
            last_error = exc
    raise last_error if last_error is not None else jwt.InvalidTokenError()


# --- CSRF (Security.md §8.4): double-submit token ---------------------------

def issue_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf(header_token: str | None, cookie_token: str | None) -> bool:
    if not header_token or not cookie_token:
        return False
    return hmac.compare_digest(header_token, cookie_token)   # constant time
