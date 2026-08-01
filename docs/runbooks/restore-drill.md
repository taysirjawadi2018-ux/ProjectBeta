# Runbook — Backup Restore Drill

**Owners:** DBA, platform engineer
**Reference:** [`Security.md` §15](../Security.md)
**Schedule:** weekly, automated (`ops/backup/restore-drill.sh`). Failure is a
**P1** (`Security.md` §14.2).
**The principle:** *a backup that has never been restored is a hypothesis.*

---

## 1. The automated drill

`ops/backup/restore-drill.sh` runs weekly on cron and:

1. Restores the `watiq` stanza with `pgbackrest` to a **point-in-time 2 hours
   ago** (`--type=time`), into a scratch directory — never into the live
   cluster.
2. Starts the scratch instance on port 5499.
3. Verifies the restore is *usable*, not merely that files were written:

   ```sql
   SELECT count(*) > 0 AS has_users FROM users;
   SELECT count(*) = 5 AS has_all_roles FROM pg_roles
    WHERE rolname IN ('watiq_citizen','watiq_staff','watiq_auth',
                      'watiq_auditor','watiq_admin');
   SELECT bool_and(relrowsecurity) AS rls_intact FROM pg_class
    WHERE relname IN ('users','requests','documents','payments','appointments');
   SELECT count(*) >= 60 AS policies_intact FROM pg_policies WHERE schemaname='public';
   ```

   The last two checks are the point: a restore that brings back the data
   **without the RLS model** is a silent, total loss of access control that
   would look like a success.

4. Stops the scratch instance, prints `restore drill OK for <target time>`.

## 2. Operator-triggered drill (monthly, or after any backup-config change)

Same steps, hands-on, with the human looking for anomalies:

```bash
# 1. Confirm the repo is healthy first.
pgbackrest --stanza=watiq info

# 2. Run the scripted drill and inspect the output.
sudo -u postgres bash ops/backup/restore-drill.sh

# 3. Deliberately test the failure modes the script does not:
#    - restore the OLDEST retained full backup (retention: 4 local, 8 offsite);
#    - restore from the OFFSITE repo (repo2) to prove the offsite copy works;
#    - verify WAL replay reaches the intended target time:
#      SELECT pg_last_xact_replay_timestamp() FROM pg_is_in_recovery() CROSS JOIN ...
```

## 3. Point-in-time restore (real recovery)

When the PITR path is actually needed (incident, corruption, mistaken delete):

```bash
# 1. Stop writes: the application is already read-only or down (db-failover.md).
# 2. Choose the target: precise time from the incident, or a transaction ID.
pgbackrest --stanza=watiq --type=time --target="2026-07-15 09:30:00+00" \
    --delta restore

# 3. Start Postgres; it replays WAL to the target and stops.
# 4. Verify the security model survived (same SQL as §1.3) BEFORE opening traffic.
# 5. Point the app at the restored instance (db-failover.md §4), run roles-init
#    if the login roles are missing, and validate per-role logins.
# 6. Announce the restore window; the drill checks above are now the acceptance
#    criteria, not a hope.
```

## 4. When the drill fails

1. **A failed drill is a P1** — page, do not defer.
2. Classify: repo corruption, WAL gap, configuration drift, or the drill
   script itself.
3. Repair the cause, re-run the drill, and only then close the alert.
4. If the *offsite* copy fails while the local one passes, the remediation is
   a P2 for the replication pipeline, but the drill alert stays open until the
   offsite copy also restores cleanly.

## 5. What to check before trusting any restore

- [ ] `pgbackrest info` shows the expected full/diff/WAL set.
- [ ] The 5 NOLOGIN bundles exist (`has_all_roles`).
- [ ] RLS is enabled on the load-bearing tables (`rls_intact`).
- [ ] Policy count ≥ 60 (`policies_intact`) — `Watiq.sql` defines exactly 60
      (`Security.md` §15); the floor tolerates deliberate consolidation but
      catches a dropped access-control model.
- [ ] A sample login per role succeeds against the restored instance.
