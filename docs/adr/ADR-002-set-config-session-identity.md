# ADR-002 — Session identity via `set_config(..., true)` with bind parameters

**Status:** Accepted
**Date:** 2026-07
**Drivers:** `Watiq.sql` §7 operational note; injection defence (`Security.md` §9)

## Context

Every RLS policy in `Watiq.sql` §7 evaluates against three session GUCs:
`app.current_user_id`, `app.current_staff_id`, `app.current_office_id`.
The application must set them at the start of every unit of work.

The obvious SQL is `SET LOCAL app.current_user_id = '123'`. The problem:
`SET LOCAL` **cannot take a bind parameter**. Written naively with an f-string:

```python
await conn.execute(text(f"SET LOCAL app.current_user_id = '{user_id}'"))
```

this is total authorization bypass, not merely data disclosure. A `user_id` of
`1'; SET app.current_office_id = '99` rewrites the attacker's own office scope,
and every RLS policy then evaluates correctly — against forged identity.

The functional equivalent `set_config(name, value, is_local)` is an ordinary
function call and **can** be parameterized.

## Decision

Identity is set with:

```python
SELECT set_config('app.current_user_id',   :user_id,   true),
       set_config('app.current_staff_id',  :staff_id,  true),
       set_config('app.current_office_id', :office_id, true)
```

inside `rls_transaction()` (`Backend.md` §4.2), with four invariants:

1. **Bind parameters, never f-strings** — enforced by a Semgrep rule
   (`Security.md` §9.1) that bans `SET LOCAL app.` and f-string SQL outright.
2. **`is_local = true`** — the settings die with the transaction, so a pooled
   connection can never carry one citizen's identity into the next request.
3. **Inside `conn.begin()`** — `SET LOCAL` outside a transaction is a no-op
   with only a warning.
4. **Empty string for absent ids** — `''` → `NULLIF(..., '')` → `NULL` →
   matches no rows. Never `'0'` or `'None'`, which would match (or error on)
   the wrong thing.

## Consequences

- Every RLS-bearing query must run inside an explicit transaction. Enforced by
  the single `db` FastAPI dependency; nothing else may touch the connection.
- The context leak test (`Security.md` §16.1) proves transaction locality.
- F-string SQL is banned everywhere, not just here — Semgrep fails CI
  (`Structure.md` §8).

## Related

- `Architecture.md` §9 (summary), `Backend.md` §4.2, `Security.md` §9.1.
