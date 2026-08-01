# Runbook — Database Failover (primary → replica)

**Owners:** on-call engineer, DBA
**Reference:** [`Security.md` §13.2](../Security.md) (SPOF note), §15 (PITR)
**Targets:** RTO ≤ 2 h, RPO ≤ 5 min (streaming WAL)

The primary is the platform's single true point of failure. A promotion
runbook must exist because the moment it is needed is not the moment to learn
it. **This procedure is rehearsed in staging quarterly.**

---

## 0. Preconditions (maintained continuously)

- Streaming replication is up (run this check in the monitoring probe):
  ```sql
  SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()
  FROM pg_stat_get_wal_senders() WHERE false;  -- monitor via pg_stat_replication
  ```
  Healthy means: one replica in `streaming` state, replay lag < 60 s.
- The replica has the same `Watiq.sql` schema and the same roles/policies
  (restore-drill proves the policies survive — a replica missing RLS is not a
  replica, it is a breach waiting to happen).
- Offsite backups are current (`pgbackrest` + nightly MinIO replication).

## 1. Detect

| Signal | Likely meaning |
|---|---|
| `readyz` failing on DB check | primary unreachable or down |
| `pg_isready` fails; WAL archiving stopped | primary down |
| replication lag growing | primary degraded (disk/IO) |
| `nft`/Wazuh host alert on the primary | possible compromise — prefer failover over repair |

## 2. Decide: failover or repair?

- Repair when: the primary is alive but degraded, no data-loss risk, and the
  replica lag is acceptable.
- **Failover when:** the primary is down, compromised, or the filesystem is
  corrupted. Do not delay a promotion to investigate — RPO is bounded by WAL,
  not by patience.

## 3. Promote the replica

On the replica host:

```bash
# 1. Confirm the replica is as current as possible.
sudo -u postgres psql -c "SELECT pg_last_wal_replay_lsn(), pg_last_wal_receive_lsn()"

# 2. Promote (either method; trigger-file method is scripted in ops):
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/data
# or
sudo touch /var/lib/postgresql/data/promote  # if configured

# 3. Verify it is now a primary accepting writes:
sudo -u postgres psql -c "SELECT pg_is_in_recovery()"   # -> f
```

## 4. Repoint the application

The five role DSNs (`dsn_citizen`, `dsn_staff`, `dsn_auth`, `dsn_auditor`,
`dsn_admin`) plus the migrate DSN must point at the new primary.

1. Update the secret files / DNS entry used by the DSNs.
2. Rolling restart of api and worker replicas.
3. Verify per role: login as citizen → 200; staff login + MFA → 200; one
   auditor read; one admin operation. If any role fails, the replica's login
   roles are missing — re-run `roles-init` (`docker-compose.prod.yml`).

## 5. Repair or retire the old primary

- If the old primary was only down: bring it back as a **replica** of the new
  primary (rebase its timeline — never let it accept writes again; a split
  brain is worse than downtime):
  ```bash
  sudo -u postgres rm -rf /var/lib/postgresql/data
  sudo -u postgres pg_basebackup -h <new-primary> -D /var/lib/postgresql/data -R -P
  ```
  `-R` writes the standby config; verify `pg_stat_replication` shows it
  streaming.
- If the old primary was compromised: preserve it for forensics
  (`incident-response.md` §3.4), and build the replacement replica from
  backup.

## 6. Post-failover

- [ ] Rotate the old primary's DB passwords (`secret-rotation.md` §1) — it may
      be compromised.
- [ ] Verify WAL archiving resumes from the new primary; confirm the next
      full backup runs.
- [ ] Update the monitoring: alert sources, `pgbackrest` stanza host, MinIO
      replication target.
- [ ] Schedule the quarterly failover drill again — a failed drill is a P1
      (`Security.md` §14.2).

## What this runbook does not cover

- PITR restore to an arbitrary point in time → `restore-drill.md`.
- Data-loss assessment after a forced promotion (WAL not yet archived) — the
  `pgbackrest` repo is the fallback, and the restore drill is the proof it
  works.
