# ADR-005 — Opaque refresh tokens, not stateless refresh JWTs

**Status:** Accepted
**Date:** 2026-07
**Drivers:** `Watiq.sql` `sessions` table

## Context

The schema models sessions as rows: `sessions.refresh_token_hash` with
`revoked_at` / `revoked_reason` (`'logout'`, `'admin_revoke'`, `'offboarding'`,
`'password_change'` …). Revoking a departing employee's access is an UPDATE on
this table, not a password reset — and it must take effect immediately.

A stateless refresh JWT carries its own expiry and cannot be revoked before
it. It would render the `sessions` table decorative, and a stolen refresh JWT
would stay valid for its whole lifetime with no detection path.

## Decision

- **Access tokens:** short-lived (15 min) EdDSA (Ed25519) JWTs, held in memory
  only by the SPA. Claims: `sub`, `typ` (`citizen`/`staff`), `sid` (→
  `sessions.id`), `office` and `perms` for staff, `mfa`, `iat`, `exp`, `jti`
  (`Backend.md` §6.2).
- **Refresh tokens:** opaque 256-bit random values (32 bytes, base64url),
  stored only as SHA-256 hashes in `sessions.refresh_token_hash`.
- **Rotation on every use**, with **reuse detection**: presenting an
  already-rotated token proves theft and revokes the entire session family
  (`Backend.md` §6.3).
- Revocation is instant via `sessions.revoked_at`; emergency access-token
  revocation via a `jti` denylist in Redis.

## Consequences

- One Redis-or-Postgres lookup per refresh (every 15 min per session —
  negligible).
- Buys: instant revocation (offboarding, device kill), a per-device session
  list for citizens, and stolen-token detection.
- Cost: a session row per device; a compromised DB now also exposes token
  hashes — but hashes are not usable tokens, and the rotation/reuse pair turns
  a replay into a family-wide logout plus a P1 security event.

## Related

- `Architecture.md` §9 (summary), `Backend.md` §6.2–6.3, `Security.md` §7.1.
