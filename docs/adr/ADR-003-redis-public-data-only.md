# ADR-003 — Redis caches public data only

**Status:** Accepted
**Date:** 2026-07

## Context

The catalogue search is the dominant read workload (a national deadline makes
it a spike). It wants a cache. But the RLS-scoped tables (`users`, `requests`,
`documents`, `payments`, `appointments`, `notifications`, `access_log`) are
only safe to read *as a specific principal*, and a cache key is global.

Caching an RLS-scoped row means re-implementing RLS in the cache key. Get the
namespacing subtly wrong once and one citizen is served another citizen's
request from cache — a breach with no database query to audit and nothing in
`access_log`. The failure would be invisible, which is the worst kind.

## Decision

**Only RLS-independent, publicly-readable data is cached.** The full table is
in `Backend.md` §5.2: catalogue search results, service detail, offices
delivering a service, reference tables, office directory entries, and slot
availability counts. Never: `users`, `requests`, `documents`, `payments`,
`appointments`, `notifications`, `access_log`, anything from `sessions`.

Supporting rules:

- **Namespace versioning** instead of `KEYS`/`SCAN` invalidation: every key
  embeds `wtq:{version}:…`; bumping the version orphans the generation, which
  expires naturally (`Backend.md` §5.3). This is also why the renamed-command
  lockdown in `ops/redis/redis.conf` (`KEYS`, `FLUSHALL`, `CONFIG`) is
  possible.
- **The cache fails open.** Losing Redis slows the portal down; it must not
  take it offline. Rate limiting and idempotency fail closed — the asymmetry is
  deliberate (`Backend.md` §5.5).
- Redis holds **no PII by policy**, verified by a regression test
  (`tests/security/test_no_pii_in_cache.py`), so a Redis compromise costs cache
  poisoning and rate-limit bypass — serious, but not a citizen-data breach.

## Consequences

- Per-citizen reads always hit Postgres. Accepted: they are indexed point
  lookups, and the expensive workload (national catalogue search) is exactly
  what *is* cached.
- Every cache key must be built from RLS-independent inputs only; review
  gate on new cacheable data.
- `access_log` cannot be consulted for cache hits — acceptable, because no
  cached datum is confidential.

## Related

- `Architecture.md` §9 (summary), `Backend.md` §5, `Security.md` §10.2.
