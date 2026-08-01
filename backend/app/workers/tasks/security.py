"""detect_anomalous_access: the insider-threat control (Security.md §14.3).

Every 15 minutes, on the watiq_admin engine: RLS hides nothing from the
admin role, which is exactly what this job needs — it must look across
every clerk, and one signal ("a clerk accessing a citizen with no request
at their office") only exists because RLS normally makes it impossible.

Signals implemented:
- A clerk viewing an unusual number of DISTINCT citizens today against
  their own 30-day baseline (mean + 3x sigma, floor 20) — the schema's own
  reference query, verbatim.
- An export/download burst (> 50 today) — bulk extraction rather than
  counter work.

Findings are P1 events: critical-level logs (correlate with Wazuh) plus a
Prometheus counter per kind.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import text

from app.core.db import rls_transaction
from app.core.principal import DbRole, Principal
from app.core.telemetry import SECURITY_ANOMALIES
from app.workers.tasks import JobContext, tracked

log = structlog.get_logger("watiq.workers.security")

_WORKER_PRINCIPAL = Principal(db_role=DbRole.ADMIN)

_ANOMALOUS_STAFF = text(
    """
    WITH baseline AS (
        SELECT staff_id,
               AVG(daily_count)  AS mean_count,
               STDDEV(daily_count) AS sd_count
        FROM (
            SELECT staff_id, occurred_at::date AS d, COUNT(DISTINCT user_id) AS daily_count
            FROM access_log
            WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days'
              AND occurred_at <  CURRENT_DATE
              AND staff_id IS NOT NULL
            GROUP BY staff_id, occurred_at::date
        ) h
        GROUP BY staff_id
    ),
    today AS (
        SELECT staff_id, COUNT(DISTINCT user_id) AS distinct_citizens
        FROM access_log
        WHERE occurred_at >= CURRENT_DATE AND staff_id IS NOT NULL
        GROUP BY staff_id
    )
    SELECT t.staff_id, t.distinct_citizens, b.mean_count, b.sd_count
      FROM today t
      JOIN baseline b USING (staff_id)
     WHERE b.sd_count > 0
       AND t.distinct_citizens > b.mean_count + 3 * b.sd_count
       AND t.distinct_citizens > 20
    """
)

_EXPORT_BURST = text(
    """
    SELECT staff_id, COUNT(*) AS exports
      FROM access_log
     WHERE occurred_at >= CURRENT_DATE
       AND action IN ('export', 'download')
     GROUP BY staff_id
    HAVING COUNT(*) > 50
    """
)


@tracked("detect_anomalous_access")
async def detect_anomalous_access(ctx: JobContext) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        for row in (await conn.execute(_ANOMALOUS_STAFF)).all():
            findings.append(
                {
                    "kind": "distinct_citizens",
                    "staff_id": row.staff_id,
                    "count": row.distinct_citizens,
                    "mean": round(float(row.mean_count), 2),
                    "sd": round(float(row.sd_count), 2),
                }
            )
        for row in (await conn.execute(_EXPORT_BURST)).all():
            findings.append(
                {"kind": "export_burst", "staff_id": row.staff_id, "count": row.exports}
            )

    for finding in findings:
        SECURITY_ANOMALIES.labels(kind=finding["kind"]).inc()
        log.critical(
            "anomalous_staff_access",
            **finding,
            severity="P1",
            runbook="docs/runbooks/incident-response.md",
        )
    log.info("anomalous_access_scan", findings=len(findings))
    return {"findings": len(findings)}
