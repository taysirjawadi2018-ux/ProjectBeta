# Watiq — Backend

**Python 3.12 · FastAPI · Modular Monolith · PostgreSQL 15 · Redis 7**

**Companion documents:** [`Architecture.md`](./Architecture.md) · [`Structure.md`](./Structure.md) · [`Security.md`](./Security.md)

---

## 1. The prime directive

> **The database enforces security. The backend's job is to tell the database who is asking — correctly, every time — and never to work around it.**

`Watiq.sql` implements Row-Level Security, column-level privileges, RBAC, trigger-owned columns, and an append-only audit log. Almost every bug class that would leak citizen data in a conventional backend is already fenced off *provided* the application:

1. Connects as a **non-owner** role (RLS does not apply to owners), and
2. Sets the session GUCs **inside the transaction**, and
3. Never tries to write a column the schema deliberately withheld.

Sections 3 and 4 below are how that is guaranteed. Everything else is ordinary application engineering.

---

## 2. Runtime and dependencies

```toml
# pyproject.toml  (excerpt — see Structure.md for the full file)
[project]
name = "watiq-api"
requires-python = ">=3.12,<3.13"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "gunicorn>=23.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.10",
    "pydantic-settings>=2.6",
    "redis[hiredis]>=5.2",
    "arq>=0.26",
    "argon2-cffi>=23.1",
    "pyjwt[crypto]>=2.10",
    "cryptography>=44.0",
    "pyotp>=2.9",
    "aioboto3>=13.2",          # MinIO / S3 presigned URLs
    "python-multipart>=0.0.18",
    "structlog>=24.4",
    "orjson>=3.10",
    "jsonschema>=4.23",        # per-service form_data validation
    "opentelemetry-instrumentation-fastapi>=0.49b0",
]
```

Dependencies are hash-pinned in `uv.lock`. Provenance, auditing, and patch SLAs are in [`Security.md` §12](./Security.md).

Process model:

```bash
gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --max-requests 10000 --max-requests-jitter 1000 \
  --timeout 30 --graceful-timeout 30 \
  --bind 0.0.0.0:8000
```

`--max-requests` recycles workers to bound the blast radius of any slow memory leak; the jitter prevents all workers restarting at once.

---

## 3. Configuration

Fail-fast, typed, no defaults for secrets. If a secret is missing the process **refuses to start** rather than falling back to `None` and failing mysteriously at request time.

```python
# app/core/config.py
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_nested_delimiter="__",
        secrets_dir="/run/secrets",   # Docker secrets take precedence over env
        extra="forbid",               # an unknown key is a typo, not a feature
    )

    env: Literal["dev", "staging", "prod"] = "dev"
    debug: bool = False

    # --- One DSN per database role. See Architecture.md ADR-001. -------------
    dsn_citizen: PostgresDsn
    dsn_staff: PostgresDsn
    dsn_auth: PostgresDsn
    dsn_auditor: PostgresDsn
    dsn_admin: PostgresDsn

    db_pool_size: int = 10
    db_max_overflow: int = 5
    db_statement_timeout_ms: int = 5_000

    redis_dsn: RedisDsn
    redis_max_connections: int = 50

    # --- Crypto ------------------------------------------------------------
    jwt_private_key: SecretStr          # Ed25519 PEM
    jwt_public_key: SecretStr
    access_token_ttl_seconds: int = 900          # 15 min
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 14   # 14 days
    mfa_encryption_key: SecretStr       # 32 bytes, base64 — AES-256-GCM KEK

    # --- Object storage ----------------------------------------------------
    s3_endpoint: str
    s3_bucket_documents: str = "watiq-documents"
    s3_access_key: SecretStr
    s3_secret_key: SecretStr
    presigned_get_ttl_seconds: int = 300
    max_upload_bytes: int = 10 * 1024 * 1024

    cors_origins: list[str] = Field(default_factory=list)

    @field_validator("debug")
    @classmethod
    def no_debug_in_prod(cls, v: bool, info) -> bool:
        if v and info.data.get("env") == "prod":
            raise ValueError("debug must be False in prod")
        return v

    @field_validator("mfa_encryption_key")
    @classmethod
    def key_is_32_bytes(cls, v: SecretStr) -> SecretStr:
        import base64
        if len(base64.b64decode(v.get_secret_value())) != 32:
            raise ValueError("mfa_encryption_key must decode to exactly 32 bytes")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()   # raises at import time if anything is missing
```

---

## 4. The RLS session contract

**This is the most important code in the system.** Get it wrong and every policy in `Watiq.sql` §7 becomes decorative.

### 4.1 Five engines, one per role

```python
# app/core/db.py
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlalchemy import text

from app.core.config import get_settings


class DbRole(StrEnum):
    CITIZEN = "watiq_citizen"
    STAFF = "watiq_staff"
    AUTH = "watiq_auth"
    AUDITOR = "watiq_auditor"
    ADMIN = "watiq_admin"


_ENGINES: dict[DbRole, AsyncEngine] = {}


def init_engines() -> None:
    s = get_settings()
    dsns = {
        DbRole.CITIZEN: s.dsn_citizen,
        DbRole.STAFF: s.dsn_staff,
        DbRole.AUTH: s.dsn_auth,
        DbRole.AUDITOR: s.dsn_auditor,
        DbRole.ADMIN: s.dsn_admin,
    }
    for role, dsn in dsns.items():
        _ENGINES[role] = create_async_engine(
            str(dsn),
            pool_size=s.db_pool_size,
            max_overflow=s.db_max_overflow,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args={
                "server_settings": {
                    "application_name": f"watiq-api:{role}",
                    "statement_timeout": str(s.db_statement_timeout_ms),
                    "idle_in_transaction_session_timeout": "10000",
                },
                "ssl": "require",
            },
        )
```

> **The migration user is a sixth, separate login** used only by Alembic. It owns the schema, and therefore RLS does not apply to it — which is exactly why it must never serve a request.

### 4.2 Identity, set safely

`SET LOCAL app.current_user_id = '123'` cannot take a bind parameter. Writing it with an f-string would put SQL injection at the precise point where identity is established. `set_config(name, value, is_local)` is an ordinary function call and **can** be parameterized:

```python
# app/core/db.py (continued)

_SET_CONTEXT = text(
    """
    SELECT set_config('app.current_user_id',   :user_id,   true),
           set_config('app.current_staff_id',  :staff_id,  true),
           set_config('app.current_office_id', :office_id, true)
    """
)


@asynccontextmanager
async def rls_transaction(principal: "Principal") -> AsyncIterator[AsyncConnection]:
    """Open a transaction bound to `principal`'s DB role and identity.

    `is_local = true` scopes the settings to THIS transaction, so a pooled
    connection can never carry one citizen's identity into the next request.
    On COMMIT or ROLLBACK, Postgres discards them automatically.
    """
    engine = _ENGINES[principal.db_role]
    async with engine.connect() as conn:
        async with conn.begin():
            await conn.execute(
                _SET_CONTEXT,
                {
                    # NULLIF('', ...) in the SQL helpers turns '' into NULL,
                    # so an unset id matches no rows instead of matching id 0.
                    "user_id":   str(principal.user_id)   if principal.user_id   else "",
                    "staff_id":  str(principal.staff_id)  if principal.staff_id  else "",
                    "office_id": str(principal.office_id) if principal.office_id else "",
                },
            )
            yield conn
```

Why each element matters:

| Element | Consequence if omitted |
|---|---|
| Bind parameters, not f-strings | SQL injection into the identity statement — total authorization bypass |
| `is_local = true` | Identity leaks across pooled connections; citizen A served citizen B's data |
| Inside `conn.begin()` | `SET LOCAL` outside a transaction is a no-op with only a warning |
| Empty string for absent ids | `app_current_user_id()` uses `NULLIF(..., '')`, so `''` → `NULL` → matches nothing. Sending `'0'` or `'None'` would be a type error or a wrong match |
| Per-role engine | Wrong role → wrong policy set, or (if owner) **no policies at all** |

### 4.3 Principal and the FastAPI dependency

```python
# app/core/principal.py
from dataclasses import dataclass
from app.core.db import DbRole


@dataclass(frozen=True, slots=True)
class Principal:
    db_role: DbRole
    user_id: int | None = None
    staff_id: int | None = None
    office_id: int | None = None
    role_code: str | None = None          # 'clerk', 'director', ...
    permissions: frozenset[str] = frozenset()
    session_id: str | None = None
    mfa_satisfied: bool = False

    @property
    def is_staff(self) -> bool:
        return self.staff_id is not None
```

```python
# app/core/deps.py
from typing import Annotated
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import rls_transaction
from app.core.errors import Forbidden, Unauthorized
from app.core.principal import Principal


async def current_principal(request: Request) -> Principal:
    """Decode the access JWT into a Principal. Raises 401 if absent/invalid."""
    ...  # see §6.2


async def db(
    principal: Annotated[Principal, Depends(current_principal)],
) -> AsyncConnection:
    async with rls_transaction(principal) as conn:
        yield conn


def require_permission(code: str):
    """Layer-2 authorization. Layers 3 and 4 (GRANT + RLS) still apply below."""
    async def _check(
        principal: Annotated[Principal, Depends(current_principal)],
    ) -> Principal:
        if code not in principal.permissions:
            raise Forbidden(f"missing permission: {code}")
        return principal
    return _check


DbConn = Annotated[AsyncConnection, Depends(db)]
CurrentUser = Annotated[Principal, Depends(current_principal)]
```

Usage:

```python
@router.post("/requests/{request_id}/approve", status_code=200)
async def approve_request(
    request_id: int,
    conn: DbConn,
    principal: Annotated[Principal, Depends(require_permission("request.approve"))],
) -> RequestOut:
    return await request_service.approve(conn, principal, request_id)
```

`require_permission` mirrors `fn_staff_has_permission()`, which RLS also calls. The duplication is intentional — Layer 2 gives a clean 403 instead of an opaque empty result set, and Layer 4 holds if Layer 2 is ever forgotten.

### 4.4 Anonymous access

Public catalogue endpoints still need a connection. They use a `Principal` with `db_role = CITIZEN` and **no** ids, so `app_current_user_id()` returns `NULL`, every citizen policy evaluates false, and only the tables with `USING (TRUE)` public-read policies (`office_services`) plus the plainly granted reference tables are reachable. Anonymous access is therefore constrained by the same machinery, not by a separate code path.

---

## 5. Redis

### 5.1 The caching rule

> **Only RLS-independent, publicly-readable data is cached. Citizen PII never enters Redis.**

Caching an RLS-scoped row means re-implementing RLS in the cache key. Get the namespacing wrong once and one citizen is served another's data — with no database query to audit and nothing written to `access_log`. The failure would be invisible. So we do not take the risk; per-citizen reads are indexed point lookups and are fast enough without a cache.

### 5.2 What is cached

| Data | Key pattern | TTL | Invalidation |
|---|---|---|---|
| Catalogue search results | `wtq:{v}:catalog:search:{sha1(q,filters,page)}` | 1 h | namespace version bump |
| Service detail by slug | `wtq:{v}:catalog:svc:{slug}` | 1 h | namespace version bump |
| Offices delivering a service | `wtq:{v}:svc:{slug}:offices` | 15 min | event on `office_services` write |
| Reference tables | `wtq:{v}:ref:{table}` | 24 h | namespace version bump |
| Office directory entry | `wtq:{v}:office:{id}` | 1 h | event on `offices` write |
| Slot availability | `wtq:{v}:slots:{office_id}:{date}` | 30 s | TTL only — writes are hot |
| **Never cached** | `users`, `requests`, `documents`, `payments`, `appointments`, `notifications`, `access_log`, anything from `sessions` | — | — |

Non-cache uses of Redis: rate-limit counters, idempotency keys, OTP send throttles, distributed locks, ARQ job queues.

### 5.3 Namespace versioning

Bulk invalidation without `KEYS`/`SCAN` (both of which are either dangerous or slow on a large keyspace): every key embeds a namespace version. Bumping the version orphans the entire generation, which then expires naturally.

```python
# app/core/cache.py
import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any

import orjson
from redis.asyncio import Redis

from app.core.redis import get_redis

_NS_VERSION_KEY = "wtq:nsver:catalog"


async def _ns_version(r: Redis) -> str:
    v = await r.get(_NS_VERSION_KEY)
    if v is None:
        await r.set(_NS_VERSION_KEY, 1, nx=True)
        return "1"
    return v.decode()


async def bump_catalog_version() -> None:
    """Call after any write to service_catalog / categories / offices."""
    await (await get_redis()).incr(_NS_VERSION_KEY)


def cache_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode()).hexdigest()[:20]
```

### 5.4 Cache-aside with stampede protection

A popular key expiring under load lets hundreds of requests miss simultaneously and all hit Postgres — the classic stampede. A short single-flight lock plus TTL jitter fixes it.

```python
# app/core/cache.py (continued)
import asyncio
import random

CACHE_MISS = object()


async def cached(
    key_suffix: str,
    ttl: int,
    loader: Callable[[], Awaitable[Any]],
    *,
    jitter: float = 0.1,
    lock_timeout: int = 5,
) -> Any:
    """Cache-aside read-through, public data only.

    Degradation: any Redis failure falls through to `loader()`. The cache
    FAILS OPEN — losing Redis must slow the portal down, not take it offline.
    (Rate limiting and idempotency fail CLOSED — see §5.5.)
    """
    try:
        r = await get_redis()
        key = f"wtq:{await _ns_version(r)}:{key_suffix}"
    except Exception:
        return await loader()

    try:
        hit = await r.get(key)
        if hit is not None:
            return orjson.loads(hit)

        lock_key = f"{key}:lock"
        got_lock = await r.set(lock_key, b"1", nx=True, ex=lock_timeout)
        if not got_lock:
            # Someone else is loading it. Wait briefly, then re-read once.
            await asyncio.sleep(0.05)
            hit = await r.get(key)
            if hit is not None:
                return orjson.loads(hit)

        value = await loader()
        effective_ttl = int(ttl * (1 + random.uniform(-jitter, jitter)))
        await r.set(key, orjson.dumps(value), ex=effective_ttl)
        if got_lock:
            await r.delete(lock_key)
        return value

    except Exception:
        return await loader()
```

Applied:

```python
# app/modules/catalog/service.py
async def search_services(conn, q: str, page: int) -> list[ServiceSearchOut]:
    return await cached(
        f"catalog:search:{cache_key(q, page)}",
        ttl=3600,
        loader=lambda: catalog_repo.search(conn, q, page),
    )
```

### 5.5 Degradation matrix

| Redis state | Cache reads | Rate limiting | Idempotency | Job queue | Portal |
|---|---|---|---|---|---|
| Healthy | served | enforced | enforced | running | normal |
| Unavailable | **fail open** → Postgres | **fail closed** → 503 on write endpoints | **fail closed** → 503 on payments | jobs deferred | degraded, read paths still work |

Failing rate limiting open would hand an attacker unlimited login attempts the moment they can disrupt Redis. Failing the cache closed would take the whole portal down over a non-essential component. The asymmetry is deliberate.

### 5.6 Rate limiting

Sliding-window counters keyed by principal where known, IP otherwise. Nginx and CrowdSec apply coarser limits earlier ([`Security.md` §3–4](./Security.md)); these are the application-aware ones.

| Scope | Limit | Rationale |
|---|---|---|
| `POST /auth/login` per IP | 10 / 15 min | credential stuffing |
| `POST /auth/login` per account | 5 / 15 min | targeted brute force (complements `users.locked_until`) |
| `POST /auth/otp/*` per principal | 3 / hour | SMS/email cost and abuse |
| `GET /requests/track/{code}` per IP | 20 / min | tracking-code enumeration |
| `POST /appointments` per user | 10 / hour | slot hoarding |
| `POST /documents` per user | 30 / hour | storage abuse |
| Global authenticated | 300 / min | backstop |

---

## 6. Authentication

### 6.1 Passwords

Argon2id via `argon2-cffi`, parameters at OWASP's recommended floor, rehash-on-login when parameters change.

```python
# app/core/security.py
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4,
                     hash_len=32, salt_len=16)


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, stored: str | None) -> tuple[bool, str | None]:
    """Returns (ok, new_hash_if_rehash_needed).

    `stored` is None for anonymized accounts (fn_anonymize_user nulls
    password_hash). We still run a dummy verify so that timing does not
    distinguish 'no such user' from 'wrong password'.
    """
    if stored is None:
        try:
            _ph.verify(_DUMMY_HASH, plain)   # burn the same CPU as a real check
        except (VerifyMismatchError, InvalidHashError):
            pass
        return False, None
    try:
        _ph.verify(stored, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False, None
    return True, (_ph.hash(plain) if _ph.check_needs_rehash(stored) else None)


_DUMMY_HASH = _ph.hash("watiq-timing-equalizer")
```

### 6.2 Tokens

| Token | Form | TTL | Storage (SPA) |
|---|---|---|---|
| Access | JWT, EdDSA (Ed25519) | 15 min | **memory only** — never `localStorage` |
| Refresh | opaque, 32 random bytes, base64url | 14 days | `__Host-wtq_rt` cookie: `HttpOnly; Secure; SameSite=Strict; Path=/` |

Access-token claims: `sub`, `typ` (`citizen`/`staff`), `sid` (→ `sessions.id`), `office` and `perms` for staff, `mfa`, `iat`, `exp`, `jti`.

Permissions are embedded in the access token so the hot path avoids a join — and because the token lives 15 minutes, a permission revocation takes effect within 15 minutes at worst. For immediate effect, revoking the session (`sessions.revoked_at`) is checked on refresh, and the `jti` denylist in Redis handles emergency access-token revocation.

### 6.3 Refresh rotation with reuse detection

The schema stores only `sessions.refresh_token_hash`. Rotation on every use means a stolen token is single-use; presenting an already-rotated token proves theft.

```python
# app/modules/auth/service.py
import hashlib
import secrets
from datetime import datetime, timedelta, timezone


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def rotate_refresh(conn, presented: str, ip: str, ua: str) -> TokenPair:
    row = await auth_repo.find_session_by_refresh_hash(conn, _hash_refresh(presented))

    if row is None:
        raise Unauthorized("invalid_refresh_token")

    # Reuse detection: the token was already rotated away or explicitly revoked.
    # Either way this is a replay -> burn the whole family for that principal.
    if row.revoked_at is not None:
        await auth_repo.revoke_all_sessions_for(
            conn,
            user_id=row.user_id,
            staff_id=row.staff_id,
            reason="token_reuse_detected",
        )
        log.warning("refresh_token_reuse", session_id=str(row.id), ip=ip)
        raise Unauthorized("invalid_refresh_token")

    if row.expires_at <= datetime.now(timezone.utc):
        raise Unauthorized("expired_refresh_token")

    new_refresh = secrets.token_urlsafe(32)
    await auth_repo.revoke_session(conn, row.id, reason="rotated")
    new_session = await auth_repo.create_session(
        conn,
        user_id=row.user_id,
        staff_id=row.staff_id,
        refresh_token_hash=_hash_refresh(new_refresh),
        mfa_satisfied=row.mfa_satisfied,
        ip_address=ip,
        user_agent=ua,
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    return TokenPair(access=mint_access_token(new_session), refresh=new_refresh)
```

`revoked_reason` uses the schema's own vocabulary: `logout`, `admin_revoke`, `offboarding`, `password_change`, plus `rotated`, `token_reuse_detected`, `anonymization`.

### 6.4 Staff MFA

`staff.mfa_secret` carries an explicit instruction in the schema: *"MUST be encrypted application-side before insert."* Honour it with AES-256-GCM under a KEK from Docker secrets/Vault.

```python
# app/core/crypto.py
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_AAD = b"watiq:staff.mfa_secret:v1"   # binds ciphertext to its purpose


def _kek() -> bytes:
    return base64.b64decode(get_settings().mfa_encryption_key.get_secret_value())


def encrypt_mfa_secret(plaintext: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(_kek()).encrypt(nonce, plaintext.encode(), _AAD)
    return base64.b64encode(nonce + ct).decode()


def decrypt_mfa_secret(stored: str) -> str:
    raw = base64.b64decode(stored)
    return AESGCM(_kek()).decrypt(raw[:12], raw[12:], _AAD).decode()
```

Login flow for staff: password → **partial** session (`sessions.mfa_satisfied = FALSE`) → TOTP or recovery code → `mfa_satisfied = TRUE`. Endpoints touching citizen PII require `principal.mfa_satisfied`. Recovery codes are hashed in `staff_recovery_codes` and marked `used_at` on redemption — the partial index `WHERE used_at IS NULL` makes the lookup cheap.

### 6.5 Lockout and OTP

- Failed login → `failed_login_attempts += 1`; at 5, set `locked_until = now() + 15 min`. Success resets the counter and sets `last_login_at`.
- **Lockout responses are identical to wrong-password responses** and take the same time, so lockout state is not an account-existence oracle.
- OTPs go through `verification_codes`: hash only, honour `max_attempts`, honour `expires_at > created_at`. The schema's partial unique indexes (`uq_verification_codes_active_user/staff`) already guarantee one live code per principal per purpose — re-requesting must consume or delete the previous row rather than inserting a second one.

---

## 7. Domain rules the API must honour

These come directly from the schema. Violating one produces either a constraint error or, worse, a silent privilege problem.

### 7.1 Never accept trigger-owned or privilege-withheld fields

| Field | Owner | API behaviour |
|---|---|---|
| `requests.tracking_code` | `fn_requests_before_insert()` | Not in any input schema. Returned, never accepted. |
| `requests.status_id` | trigger default + staff workflow | Absent from the citizen create schema; citizens have no `INSERT` grant on it |
| `appointments.office_id` / `office_service_id` | `fn_appointments_derive_from_slot()` | Client sends `slot_id` only; the trigger derives the rest |
| `appointment_slots.booked_count` | `fn_sync_slot_booked_count()` | Read-only everywhere |
| `documents.status` / `verified_by` / `verified_at` | staff verification flow | Citizens have no grant; a citizen cannot self-verify an upload |
| `payments.amount` / `currency` / `user_id` / `type_id` | finance | Not writable by office staff at all |

Enforced structurally: Pydantic input models use `extra="forbid"` and simply do not declare these fields, so a mass-assignment attempt is a 422 before any SQL runs.

### 7.2 Effective fee and SLA are never computed in Python

`v_service_availability` already resolves `COALESCE(os.fee_override, sc.base_fee)` and `COALESCE(os.processing_time_override, sc.processing_time)`. Re-implementing that rule in Python creates a second source of truth that will drift. **Read the view.**

### 7.3 `access_log` inserts must not use `RETURNING`

`Watiq.sql` line ~1360 spells this out: `watiq_staff` and `watiq_citizen` have `INSERT` but no `SELECT` policy on `access_log`, so `INSERT … RETURNING id` fails.

```python
# app/modules/audit/repository.py
_INSERT_ACCESS_LOG = text("""
    INSERT INTO access_log (staff_id, user_id, action, resource_type,
                            resource_id, request_id, document_id,
                            query_params, ip_address, user_agent)
    VALUES (:staff_id, :user_id, :action, :resource_type,
            :resource_id, :request_id, :document_id,
            CAST(:query_params AS jsonb), CAST(:ip AS inet), :ua)
""")   # deliberately no RETURNING — the role has INSERT but not SELECT
```

Log a read whenever staff view, list, search, download, export, or print citizen data — that is the whole purpose of the table, and `action` is `CHECK`-constrained to exactly that vocabulary.

### 7.4 Anonymization ordering

`fn_anonymize_user()` documents its caller contract: purge blob storage **first**, because the function deletes the `documents` rows and the `storage_key`s go with them.

```python
# app/modules/admin/service.py
async def anonymize_citizen(conn, principal, user_id: int, reason: str) -> None:
    # 1. Collect keys while the rows still exist.
    keys = await documents_repo.list_storage_keys_for_user(conn, user_id)
    # 2. Delete the objects. Idempotent; safe to retry.
    await storage.delete_objects(keys)
    # 3. Only now let the DB drop the rows and strip the PII.
    await conn.execute(
        text("SELECT fn_anonymize_user(:uid, :reason, :actor)"),
        {"uid": user_id, "reason": reason, "actor": principal.staff_id},
    )
```

Runs on the `watiq_admin` engine — the function's `EXECUTE` was revoked from `PUBLIC` and granted only to that role.

### 7.5 `form_data` validation

`requests.form_data` is `JSONB NOT NULL DEFAULT '{}'` — the database cannot police its shape, and unbounded JSONB is both a storage-abuse and a parser-DoS vector. Each `service_catalog.code` gets a JSON Schema in `app/modules/requests/formschemas/`, validated before insert, with hard caps on depth, key count, string length, and total serialized size. Details in [`Security.md` §8](./Security.md).

---

## 8. Error handling

Database errors must never reach the client. Constraint violations are translated into stable, non-leaky API errors.

```python
# app/core/errors.py
from asyncpg.exceptions import (
    CheckViolationError, ForeignKeyViolationError,
    InsufficientPrivilegeError, UniqueViolationError,
)

CONSTRAINT_ERRORS: dict[str, tuple[int, str, str]] = {
    # constraint name -> (status, code, safe message)
    "chk_appointment_slots_not_overbooked":
        (409, "slot_full", "This time slot is fully booked."),
    "uq_appointments_user_slot":
        (409, "already_booked", "You already have a booking for this slot."),
    "uq_users_national_id":
        (409, "duplicate_national_id", "This national ID is already registered."),
    "uq_users_email":
        (409, "duplicate_email", "This email address is already registered."),
    "uq_users_phone":
        (409, "duplicate_phone", "This phone number is already registered."),
    "chk_users_national_id_format":
        (422, "invalid_national_id", "National ID must be exactly 8 digits."),
    "chk_users_phone_format":
        (422, "invalid_phone", "Phone must be in the form +216XXXXXXXX."),
    "fk_requests_service_office":
        (422, "service_not_offered", "This office does not offer that service."),
    "chk_documents_storage_key_not_url":
        (500, "internal_error", "An internal error occurred."),   # our bug, not theirs
    "uq_requests_tracking_code":
        (500, "internal_error", "An internal error occurred."),   # retry-worthy
    "chk_payments_amount_positive":
        (422, "invalid_amount", "Amount must be greater than zero."),
}
```

```python
# app/core/exception_handlers.py
@app.exception_handler(DBAPIError)
async def handle_db_error(request: Request, exc: DBAPIError) -> JSONResponse:
    orig = getattr(exc, "orig", None)
    name = getattr(orig, "constraint_name", None)

    if name in CONSTRAINT_ERRORS:
        status, code, message = CONSTRAINT_ERRORS[name]
        if status >= 500:
            log.error("constraint_violation", constraint=name, exc_info=exc)
        return problem(request, status, code, message)

    if isinstance(orig, InsufficientPrivilegeError):
        # SQLSTATE 42501 — a column-level GRANT refused us. This is a genuine
        # server-side bug: the service tried to write something its role may
        # not. Never echo the SQL.
        log.error("privilege_denied", exc_info=exc)
        return problem(request, 403, "forbidden", "Operation not permitted.")

    log.error("unhandled_db_error", exc_info=exc)
    return problem(request, 500, "internal_error", "An internal error occurred.")
```

Responses follow RFC 9457 (`application/problem+json`) and carry the request id for support correlation. **No** SQL, table names, constraint text, or stack traces cross the boundary.

`InsufficientPrivilegeError` is worth calling out: in this architecture a 42501 is almost always *our* bug, and it means Layer 3 caught what Layer 2 missed. It should page.

---

## 9. Documents and object storage

`documents.storage_key` is a private object key, never a URL — `chk_documents_storage_key_not_url` rejects anything containing `://`, and the schema comment is unambiguous: *"Never expose directly; never make the bucket public."*

**Upload:**

1. `POST /requests/{id}/documents/upload-url` → server validates ownership and that the request is not final, then issues a **presigned PUT** scoped to a server-generated key `requests/{yyyy}/{mm}/{uuid4}.{ext}`, with `content-length-range` and content-type conditions.
2. Client PUTs directly to MinIO.
3. `POST /requests/{id}/documents` registers the row with `status = 'pending'`.
4. ARQ job: download, verify size and **magic bytes** (never trust the extension), ClamAV scan, verify `checksum_sha256`, strip EXIF from images. Clean → stays `pending` awaiting staff verification. Infected → object deleted, row deleted, security event raised.
5. Staff verification flips `status` to `verified`/`rejected` — and `chk_documents_verification_complete` guarantees `verified_by` and `verified_at` are both set.

**Download:** authorize (RLS already scopes the row; `document.download` permission also required for staff), write an `access_log` row with `action = 'download'`, then return a **300-second presigned GET**. The `storage_key` is never serialized into any response model.

---

## 10. Background jobs

ARQ, on the Redis already present. No second broker.

| Job | Trigger | Notes |
|---|---|---|
| `scan_document` | after upload registration | ClamAV + magic bytes + EXIF strip |
| `send_notification` | status change, appointment reminder | Writes `notifications`, then dispatches email/SMS |
| `purge_expired_auth_artifacts` | cron, daily 03:00 | Calls the schema's own `fn_purge_expired_auth_artifacts()` on the admin engine |
| `expire_no_show_appointments` | cron, hourly | `scheduled` + past date → `no_show`; the AFTER trigger releases slot capacity |
| `refresh_catalog_cache` | cron, hourly | Warms the catalogue keys so the first citizen of the day is not the one who pays for the miss |
| `reconcile_payments` | cron, every 15 min | Compares `pending` payments against the gateway |
| `detect_anomalous_access` | cron, every 15 min | Scans `access_log` for a clerk viewing an unusual number of distinct citizens — the insider-threat control |

Jobs are idempotent and retried with exponential backoff. Each runs under an explicit `Principal` (usually `ADMIN`) so RLS applies to workers exactly as it does to requests.

---

## 11. Observability

- **Logs** — structlog → JSON → Loki. Every line carries `request_id`, `principal_type`, `principal_id`, `route`, `status`, `duration_ms`. A redaction processor drops any key in the deny-list (`password`, `token`, `refresh_token`, `mfa_secret`, `code_hash`, `national_id`, `transaction_id`, `reference_number`, `form_data`, `storage_key`). The schema explicitly forbids the last two payment fields in plaintext logs.
- **Metrics** — Prometheus: request rate/latency/status by route, DB pool saturation **per role**, cache hit ratio per namespace, rate-limit rejections, job queue depth and failures, auth failure rate.
- **Traces** — OpenTelemetry across FastAPI → SQLAlchemy → Redis, with SQL statement text disabled to avoid capturing bound PII.
- **Health** — `/healthz` (liveness, no dependencies) and `/readyz` (Postgres + Redis reachable). Neither is exposed publicly through Nginx.

---

## 12. Testing

| Layer | Tooling | What it proves |
|---|---|---|
| Unit | pytest | Service logic in isolation |
| Integration | pytest + testcontainers (real Postgres 15 with `Watiq.sql` applied) | Constraints, triggers, and views behave as assumed |
| **RLS regression** | pytest, one connection per DB role | Citizen A cannot read citizen B; a clerk cannot read another office; a citizen cannot self-approve. **Non-negotiable** — see [`Security.md` §16](./Security.md) |
| Contract | Schemathesis against the generated OpenAPI | No 500s on malformed input |
| Load | k6 | Catalogue search under a national deadline spike |

Coverage floors: 90% on `app/core/`, 85% on services, **100% on `app/core/db.py`** — the RLS session contract is the one file where a gap is unacceptable.
