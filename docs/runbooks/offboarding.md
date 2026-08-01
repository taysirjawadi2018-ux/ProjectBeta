# Runbook — Staff Offboarding

**Owners:** office director (requestor), platform admin (executor), security
lead (verification)
**Reference:** [`Backend.md` §6.3](../Backend.md) (session vocabulary),
[`Security.md` §14.4](../Security.md) (compromised account)

Leaving staff keep their rights until a human revokes them. The goal of this
runbook is that the gap between "announced departure" and "no access" is
measured in minutes, and that the revocation is auditable.

---

## 1. Before the last day

1. The director confirms the departure and the last working day.
2. The platform admin **deactivates the account** (this is the actual cut):

   ```sql
   -- As watiq_admin (app: admin module, staff.manage permission).
   UPDATE staff SET is_active = FALSE WHERE id = :staff_id;
   ```

3. **Revoke all sessions immediately** — do not wait for token expiry:

   ```sql
   UPDATE sessions
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'offboarding'
    WHERE staff_id = :staff_id AND revoked_at IS NULL;
   ```

   `revoked_reason` uses the schema's own vocabulary (`Backend.md` §6.3);
   `'offboarding'` distinguishes this from `'admin_revoke'` (incident) and
   `'logout'` (self).

4. The access JWT lives up to 15 minutes. If immediate cut is required, add
   the token's `jti`s to the Redis denylist for the remaining TTL.

## 2. Workspace and role cleanup

1. **Unassign in-flight work.** `requests.assigned_staff_id` is `ON DELETE
   SET NULL` and the trigger keeps `assigned_at` in lockstep — deactivating the
   staff row does not touch the requests. Reassign the open queue:

   ```sql
   UPDATE requests SET assigned_staff_id = :new_staff_id
    WHERE assigned_staff_id = :staff_id AND status_id NOT IN (
        SELECT id FROM request_statuses WHERE is_final = TRUE
    );
   ```

2. **Recovery codes**: `staff_recovery_codes` rows cascade on staff deletion;
   for a deactivated (not deleted) account, delete the unused codes:

   ```sql
   DELETE FROM staff_recovery_codes
    WHERE staff_id = :staff_id AND used_at IS NULL;
   ```

3. **Role/permission changes** (if the person stays in a lesser role): update
   `staff.role_id`, or adjust `role_permissions` — permission changes are
   `INSERT`s, not deployments (`Architecture.md` §1). The access token embeds
   `perms`, so re-login picks up the change within one login; sessions were
   revoked in step 3 anyway.

4. **MFA**: `mfa_secret` stays encrypted at rest; if the account is reused
   later, re-enrollment issues a new secret and new recovery codes.

## 3. Verify

- [ ] `SELECT is_active FROM staff WHERE id = :id` → `false`.
- [ ] `SELECT count(*) FROM sessions WHERE staff_id = :id AND revoked_at IS NULL`
      → `0`.
- [ ] The former staff's refresh token presented to `/auth/refresh` returns
      401 `invalid_refresh_token`.
- [ ] Open requests are reassigned; no request is orphaned in the office queue.
- [ ] Access-log entries remain intact (FK is `ON DELETE SET NULL`, never
      `CASCADE` — the audit trail must outlive the account, `Watiq.sql` §6).

## 4. After departure (30-day window)

- [ ] Remove account access to office machines, MinIO console, Vault, and the
      observability stack.
- [ ] Confirm no scheduled notifications or ARQ jobs are bound to the account.
- [ ] At the next rotation, the account's secrets (if it held any) are rotated
      per `secret-rotation.md`.

## Offboarding during an incident

If departure is a dismissal mid-incident, follow `incident-response.md` §3.1:
the same two statements with `revoked_reason = 'admin_revoke'`, plus password
rotation of any shared credential the person touched.
