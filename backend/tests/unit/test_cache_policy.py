"""No citizen PII in Redis (ADR-003, Backend.md §5, Security.md §16.3).

Redis holds no RLS. Anything cached there is readable by any component holding
the connection, with none of the per-citizen scoping that makes Postgres safe.
So the rule is absolute and worth restating: **only RLS-independent, publicly
readable data is cached.** The catalogue, the office directory, the lookup
tables. Never a request, a document, a payment, or a person.

These are the **static** half: they read the source and check that no cache call
site names a citizen table. They need no Redis and no database, so they run on
every commit — and they are the half that actually catches a new `cached()` call
during review.

The **live** half — scanning every key and value in a running Redis — lives in
`tests/security/test_no_pii_in_cache.py`, because it needs a real server.

(These tests are synchronous on purpose, and that is why they live under
`tests/unit/` rather than beside the security suite: pytest-asyncio runs the
security suite on a session-scoped event loop, and a sync test interleaved into
that session breaks fixture setup for every async test after it.)
"""

from __future__ import annotations

import re
from pathlib import Path

# Not marked `security`: this needs no database and belongs in the fast unit
# lane, but it enforces a security invariant and is listed in Security.md §16.3.

APP_DIR = Path(__file__).resolve().parents[2] / "app"

# Backend.md §5 "never cached" row. A cache key mentioning any of these is a bug.
FORBIDDEN_IN_CACHE_KEYS = [
    "requests",
    "documents",
    "payments",
    "access_log",
    "users",
    "sessions",
    "notifications",
    "verification_codes",
    "staff",
]

# The namespaces that ARE allowed to be cached. All public reference data,
# except "heartbeat" — main.py's startup warm-up of the Redis path, which caches
# the health-check payload and touches no citizen data.
ALLOWED_CACHE_PREFIXES = ("catalog:", "ref:", "office", "svc:", "slots:", "heartbeat")

# Shapes that must never appear in a Redis value.
CIN = re.compile(rb"\b\d{8}\b")
EMAIL = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(rb"\+216\d{8}")
# Argon2/bcrypt material must never be cached under any circumstances.
PW_HASH = re.compile(rb"\$(argon2|2[aby])\$")


# ---------------------------------------------------------------------------
# Static half — always runs, no Redis required.
# ---------------------------------------------------------------------------


def _cached_call_sites() -> list[tuple[Path, str]]:
    """Every literal cache key passed to cached() anywhere in the app."""
    pattern = re.compile(r"""cached\(\s*(?:f?["'])([^"']+)""")
    found: list[tuple[Path, str]] = []
    for path in APP_DIR.rglob("*.py"):
        for match in pattern.finditer(path.read_text(encoding="utf-8")):
            found.append((path, match.group(1)))
    return found


def test_cache_call_sites_exist_at_all() -> None:
    """Guard against this whole file passing because the regex matched nothing."""
    assert _cached_call_sites(), (
        "no cached() call sites found — the scan below would be vacuous"
    )


def test_no_cache_key_names_a_citizen_table() -> None:
    offenders = [
        (str(path.relative_to(APP_DIR)), key)
        for path, key in _cached_call_sites()
        for table in FORBIDDEN_IN_CACHE_KEYS
        if table in key.lower()
    ]
    assert offenders == [], (
        f"cache keys referencing citizen-scoped data: {offenders}. "
        "Redis has no RLS; see ADR-003."
    )


def test_every_cache_key_is_in_an_allowed_namespace() -> None:
    """An allow-list, not a deny-list. A new cache of citizen data would more
    likely be named something new than something on the forbidden list above."""
    offenders = [
        (str(path.relative_to(APP_DIR)), key)
        for path, key in _cached_call_sites()
        if not key.startswith(ALLOWED_CACHE_PREFIXES)
    ]
    assert offenders == [], (
        f"cache keys outside the public-data namespaces {ALLOWED_CACHE_PREFIXES}: "
        f"{offenders}"
    )


def test_only_the_catalog_module_caches() -> None:
    """Structural control: caching lives in one module, so review has one place
    to look. A `cached()` in the requests or documents module is by definition
    caching citizen data."""
    callers = {
        str(path.relative_to(APP_DIR).parts[-2])
        for path, _ in _cached_call_sites()
        if len(path.relative_to(APP_DIR).parts) > 1
    }
    assert callers <= {"catalog", "core"}, (
        f"modules other than catalog are caching: {sorted(callers - {'catalog', 'core'})}"
    )
