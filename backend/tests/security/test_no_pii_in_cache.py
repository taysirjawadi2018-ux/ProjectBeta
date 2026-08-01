"""Live scan of Redis for citizen PII (ADR-003, Security.md §16.3).

The static half of this control — checking that no `cached()` call site names a
citizen table — lives in `tests/unit/test_cache_policy.py` and runs on every
commit without a server.

This is the other half: after a real run against a real cache, look at what is
actually in there. It catches PII arriving *indirectly*, inside an object whose
shape nobody re-checked after a schema change — which is the realistic way this
invariant breaks, since nobody ever writes `cached("users:pii", ...)` on purpose.

Async on purpose: everything in tests/security/ shares one session-scoped event
loop, and a synchronous test interleaved here breaks fixture setup for every
async test that follows it.
"""

from __future__ import annotations

import os
import re

import pytest

pytestmark = [pytest.mark.security, pytest.mark.integration]

# Backend.md §5 "never cached" row.
FORBIDDEN_IN_CACHE_KEYS = [
    "requests", "documents", "payments", "access_log",
    "users", "sessions", "notifications", "verification_codes", "staff",
]

# Shapes that must never appear in a Redis value.
CIN = re.compile(rb"\b\d{8}\b")
EMAIL = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(rb"\+216\d{8}")
# Argon2/bcrypt material must never be cached under any circumstances.
PW_HASH = re.compile(rb"\$(argon2|2[aby])\$")


async def test_no_pii_in_any_live_redis_key_or_value() -> None:
    dsn = os.getenv("WATIQ_TEST_REDIS_DSN")
    if not dsn:
        pytest.skip("set WATIQ_TEST_REDIS_DSN to scan a live cache")

    import redis.asyncio as aioredis

    client = aioredis.from_url(dsn)
    try:
        findings: list[str] = []
        async for key in client.scan_iter(match="wtq:*", count=500):
            key_bytes = key if isinstance(key, bytes) else str(key).encode()

            for table in FORBIDDEN_IN_CACHE_KEYS:
                if table.encode() in key_bytes.lower():
                    findings.append(f"key names citizen data: {key_bytes!r}")

            if await client.type(key) != b"string":
                continue
            value = await client.get(key)
            if value is None:
                continue

            for label, pattern in (
                ("CIN", CIN), ("email", EMAIL), ("phone", PHONE), ("pw_hash", PW_HASH)
            ):
                if pattern.search(value):
                    # Never echo the match itself into a test report: that would
                    # relocate the PII into CI logs, which is the problem.
                    findings.append(f"{label} pattern in value of {key_bytes!r}")

        assert findings == [], "PII found in Redis:\n" + "\n".join(findings)
    finally:
        await client.aclose()
