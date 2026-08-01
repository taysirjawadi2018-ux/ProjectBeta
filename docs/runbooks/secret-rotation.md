# Runbook — Secret Rotation

**Owners:** platform engineer, security lead
**Reference:** [`Security.md` §11](../Security.md)
**Rule:** rotation is rehearsed in staging first. An untested rotation
procedure fails at the worst possible moment. Any secret exposed in an
incident is rotated immediately, not at the next scheduled window.

All values live in Docker secrets at `/run/secrets/` (or Vault); the app reads
them once at startup (`pydantic-settings`, `secrets_dir`). Rotating a secret
therefore always ends with a rolling restart of the consumers.

---

## 1. DB role passwords (×6) — every 90 days

The six logins: `watiq_app_citizen`, `watiq_app_staff`, `watiq_app_auth`,
`watiq_app_auditor`, `watiq_app_admin`, `watiq_migrate`.

1. Generate: `openssl rand -base64 32` per role.
2. Update the secret files (`./secrets/*`) and the value used by the
   `roles-init` one-shot.
3. Apply in the database as the `postgres` superuser (or a dedicated rotation
   role):
   ```sql
   ALTER USER watiq_app_citizen WITH PASSWORD :'new_pw';
   ALTER USER watiq_app_staff   WITH PASSWORD :'new_pw';
   -- ... one per role ...
   ```
4. **Rolling restart** of api and worker — never a simultaneous kill.
5. Verify: API `readyz` green; one request per role works (login as a citizen,
   as a clerk, an audit read, an admin read).
6. If a statement times out mid-rotation, `ALTER USER` is idempotent — rerun.
   Connections already pooled on the old password fail with 28P01; the pool
   reconnects on the next checkout (`pool_pre_ping`), so a quick restart of the
   pool owners clears it.

## 2. JWT Ed25519 keypair — every 90 days, with overlap

The access-token TTL is 15 minutes. To avoid invalidating every token at once:

1. Generate a new keypair (see `make dev-keys` for the shape; in prod the
   keys come from Vault).
2. **Publish both keys** to `api` and `worker`:
   - `jwt_private_key` = the NEW private key,
   - `jwt_public_key` = the OLD public key,
   - `jwt_public_key_previous` = a second public key slot that verification
     accepts alongside the current one.
3. Rolling restart.
4. After one full access-token TTL (15 min), drop the old public key:
   `jwt_public_key` becomes the new one, `jwt_public_key_previous` is removed.
5. Verify: a token minted just before the swap verifies during the overlap,
   and fails after step 4.

## 3. MFA encryption KEK (`mfa_encryption_key`) — every 180 days, re-encrypt

`staff.mfa_secret` is AES-256-GCM ciphertext under a KEK, with AAD
`watiq:staff.mfa_secret:v1` (`Backend.md` §6.4). Rotation requires
re-encryption of every stored secret:

1. Run the maintenance job (worker task `reencrypt_mfa_secrets`) on the
   `watiq_admin` engine:
   - for each `staff.mfa_secret`: decrypt with the old KEK, re-encrypt with
     the new one;
   - journal every row processed; verify `count(re-encrypted) == count(rows)`.
2. Update the secret file, rolling restart.
3. Verify: a staff login completing TOTP succeeds; the old KEK decrypts
   nothing (the AAD + nonce make cross-KEK mixes fail loudly, not silently).

## 4. MinIO access key — every 90 days

1. Create a new access key in MinIO with the same policy (bucket
   `watiq-documents`, `s3:GetObject/PutObject/DeleteObject` only).
2. Update the secret, rolling restart of api + worker.
3. Delete the old key only after presigned-URL traffic has been clean for 24 h
   (presigned URLs issued under the old key remain valid for their TTL).

## 5. Redis ACL passwords — every 90 days

`ops/redis/users.acl` entries are `>__FROM_SECRET__` placeholders; the real
passwords come from the secret files.

1. Generate new passwords, update the secret files.
2. Update the ACL file entries, reload:
   ```bash
   redis-cli -a "$OLD_ADMIN_PW" ACL SETUSER watiq_api on ><new>
   redis-cli -a "$OLD_ADMIN_PW" ACL SETUSER watiq_worker on ><new>
   ```
3. Rolling restart of api + worker.
4. Verify: cache reads, rate limiting, and job queues all function.
   (`ACL GETUSER watiq_api` shows the new password hash.)

## 6. TLS certificates — every 90 days, automated

- ACME / national CA automation renews and deploys; monitor for expiry
  (<21 days is a P3 alert, `Security.md` §14.2).
- Postgres, Redis, and MinIO TLS certs are mounted from `./secrets`/Vault;
  renewals there follow the same rolling restart pattern.

---

## Validation checklist (every rotation)

- [ ] Rehearsed in staging first.
- [ ] No secret written into git, images, or `docker inspect`-visible env
      (secrets are files in `/run/secrets`, never `environment:`).
- [ ] `gitleaks detect --no-git` clean on the working tree.
- [ ] All consumers restarted and healthy after the final step.
- [ ] Rollback path rehearsed (old secret re-issued if verification fails).
