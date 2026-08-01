# Runbook — Incident Response

**Owners:** on-call engineer, security lead
**Reference:** [`Security.md` §14.4](../Security.md), §14.2 (alert table)
**Severity classes:** P1 (page immediately) · P2 (next business hour) · P3 (next business day)

The goal of this runbook is *containment with evidence*. `access_log` exists so
that "whose data was accessed?" is a query, not a guess — do not destroy the
material that answers it.

---

## 0. P1 triggers (Security.md §14.2)

| Alert | Source |
|---|---|
| Data-tier reachable externally (Suricata sid 9000001–3) | Suricata |
| Data-tier egress (sid 9000010) | Suricata |
| App code modified at runtime (Wazuh 100100) | Wazuh |
| Docker socket accessed (Wazuh 100102) | Wazuh |
| Refresh-token reuse > 3 in 10 min | API logs |
| `InsufficientPrivilegeError` (42501), any occurrence | API logs |
| Anomalous staff access (§14.3) | `detect_anomalous_access` job |
| Backup restore drill failed | cron |

## 1. Detect

An alert fires, a citizen reports it, or a review finds it. Log the initial
report: time, reporter, what was seen. Do not skip this — the post-incident
review needs it.

## 2. Triage (15 minutes)

1. Assign severity. Classification is one of:
   - **Data breach** — citizen data (CIN, documents, PII, payments) may have
     left the boundary.
   - **Availability** — the portal or a component is down.
   - **Integrity** — data or code may have been modified.
2. If P1: page on-call and security lead. Announce an incident channel.
3. Decide whether this is a *suspected* compromise (no confirmation yet) or a
   *confirmed* one. Both warrant containment; confirmed warrants forensics mode.

## 3. Contain

Do containment first, understanding second. Everything below is reversible
except deletion — **do not delete anything on a compromised host**.

### 3.1 Compromised staff account

```sql
-- 1. Deactivate immediately (runs on watiq_admin).
UPDATE staff SET is_active = FALSE WHERE id = :staff_id;
-- 2. Revoke every session, audited.
UPDATE sessions
   SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'admin_revoke'
 WHERE staff_id = :staff_id AND revoked_at IS NULL;
```

The access token lives 15 min; the `jti` denylist in Redis cuts it sooner:

```bash
redis-cli -a "$REDIS_ACL_PW" SETEX denylist:jti:<jti> 900 1
```

### 3.2 Compromised application credential

1. Rotate the affected DB role password (`docs/runbooks/secret-rotation.md`).
2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api worker`
3. Revoke all sessions (`revoked_reason = 'admin_revoke'`) — a stolen credential
   may have minted tokens.

### 3.3 Active exploitation

1. Manual CrowdSec ban of the source IP:
   ```bash
   cscli decisions add --ip <ip> --duration 24h --reason incident
   ```
2. If necessary, emergency WAF deny rule in
   `ops/modsecurity/rules/99-watiq-custom.conf`, then reload Nginx.
3. If exploitation is at the application layer and indeterminate, take the
   affected replica out of rotation at the load balancer.

### 3.4 Host compromise

1. **Isolate at the network layer** (nftables on the host, or the switch/cloud
   ACL if faster). Do not power off — a live host holds volatile forensics.
2. **Preserve for forensics:** snapshot the host's disks and memory before any
   remediation. Label and archive.
3. **Fail over** — promote the Postgres replica (`docs/runbooks/db-failover.md`)
   if the primary was on the compromised host.
4. Assume every secret the host could see is compromised: rotate all of them
   (`secret-rotation.md`) and monitor for their use.

## 4. Investigate

Correlate, in order of value:

1. `access_log` — who looked at what, when. This is the table's whole purpose
   (`Watiq.sql` §6).
2. API logs (Loki): `principal_id`, route, status, duration.
3. Nginx access + error logs; ModSecurity audit log
   (`SecAuditLog /var/log/modsec_audit.log`).
4. Suricata EVE (eve.json) — network-level context.
5. Wazuh FIM alerts — was code modified? Was a secret file read?
6. Postgres log — `pgaudit` role/ddl events (parameters are off by design).

**Deliverable:** a list of affected citizens' `user_id`s, with the access_log
rows as evidence. If the answer is "unknown", keep the incident open until it
isn't — an inaccurate data-breach notification is a second failure.

## 5. Eradicate & recover

1. Patch the root cause (code, config, dependency — see `Security.md` §12.3
   SLAs).
2. **Rebuild from a known-good image. Never clean in place.** The running
   state of a compromised host is not trusted.
3. If integrity is in doubt: restore from PITR (`restore-drill.md`).
4. Rotate every secret the compromised scope could have seen. Rotate
   immediately, not at the next scheduled window.
5. Restore service replica by replica; verify each healthcheck.

## 6. Notify

- Affected citizens — clear, factual, non-technical, in Arabic and French.
- The national data-protection authority (INPDP) within the statutory window.
- The hosting authority if the datacenter was involved.

## 7. Post-incident review

- Within **5 working days**. Blameless. Dated action items with owners.
- Update this runbook and the alert table with what was missing.
- If the breach involved RLS or grants, the RLS regression suite
  (`tests/security/`) must be extended with a reproducing test before the
  incident is closed.
