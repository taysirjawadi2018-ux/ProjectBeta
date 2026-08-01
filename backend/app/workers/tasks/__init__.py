"""ARQ job helpers (Backend.md §10).

Jobs run in the worker process under an explicit Principal, usually ADMIN,
so RLS applies to them exactly as it does to HTTP requests (Backend.md
§10: "Each runs under an explicit Principal"). The `tracked` decorator
feeds the job-run / job-failure metrics Prometheus already scrapes.
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any

from arq.typing import WorkerCoroutine

from app.core.telemetry import JOB_FAILURES, JOB_RUNS

# arq passes a plain dict as the job context (arq.typing has no WorkerContext).
JobContext = dict[Any, Any]


def tracked(name: str) -> Callable[[WorkerCoroutine], WorkerCoroutine]:
    """Count attempts and failures for one job; exceptions propagate so ARQ
    retries with exponential backoff (idempotent jobs, per Backend.md §10)."""

    def deco(fn: WorkerCoroutine) -> WorkerCoroutine:
        @functools.wraps(fn)
        async def wrapper(ctx: JobContext, *args: Any, **kwargs: Any) -> Any:
            JOB_RUNS.labels(job=name).inc()
            try:
                return await fn(ctx, *args, **kwargs)
            except Exception:
                JOB_FAILURES.labels(job=name).inc()
                raise

        return wrapper

    return deco
