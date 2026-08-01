# ADR-001 — The application connects as five distinct DB roles, never as the schema owner

**Status:** Accepted
**Date:** 2026-07
**Drivers:** `Watiq.sql` §7 (RLS), §7b (column grants)

## Context

Row-Level Security does not apply to the table owner, nor to superusers. If the
application connects as the role that owns the schema, every policy in
`Watiq.sql` §7 evaluates but is silently inert: `requests_owner_select`,
`requests_staff_office`, `payments_staff_update` — all of them — return
everything. The security model would appear present and be entirely decorative.
This is the single highest-impact misconfiguration possible in the system
(`Security.md` §10.1, §16.1 tests for it).

## Decision

The application maintains **five `AsyncEngine` instances**, one per DB role,
with their own pools and login users:

| Engine | Login user | NOLOGIN bundle | Serves |
|---|---|---|---|
| citizen | `watiq_app_citizen` | `watiq_citizen` | citizens + anonymous public reads |
| staff | `watiq_app_staff` | `watiq_staff` | office staff |
| auth | `watiq_app_auth` | `watiq_auth` | login/register/refresh/OTP |
| auditor | `watiq_app_auditor` | `watiq_auditor` | national auditor, tracking lookups |
| admin | `watiq_app_admin` | `watiq_admin` | back-office, erasure requests |

The migration user (`watiq_migrate`) is a sixth, separate login that **owns the
schema** and is used only by Alembic. Because it owns the schema, RLS does not
apply to it — which is exactly why it must never serve a request
(`Structure.md` §6.3, `Backend.md` §4.1).

The `NOLOGIN`/`LOGIN` split (`Structure.md` §7.1): `Watiq.sql` §7 creates the
five NOLOGIN bundles; an ops init script creates the LOGIN users who hold them.
None of the login users own anything, so RLS applies to all of them.

## Consequences

- ~5× connection-pool footprint. Mitigated by small per-role pool sizes
  (`db_pool_size=10`, `max_overflow=5`) and per-role `CONNECTION LIMIT`; if it
  ever becomes the constraint, PgBouncer in `transaction` mode is compatible
  because identity GUCs are transaction-scoped (`Architecture.md` §10).
- The right engine must be chosen per request — enforced by
  `Principal.db_role` and the `rls_transaction()` helper (`Backend.md` §4).
- A wrong engine means a wrong policy set; the owner engine means *no* policies.
- The RLS regression suite asserts no app role is the owner, and that
  cross-principal reads fail (`Security.md` §16.1).

## Related

- `Architecture.md` §9 (summary), `Backend.md` §4.1, `Structure.md` §7.1,
  `Security.md` §10.1.
