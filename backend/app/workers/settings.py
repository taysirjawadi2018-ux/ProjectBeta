"""ARQ worker entrypoint (Backend.md §10): settings for `arq app.workers.settings`.

Same Redis, same engines, same logging and telemetry as the API — the worker
is just another tenant of the shared Redis (queue) and the five per-role
engines. Jobs run under explicit Principals (usually ADMIN), so RLS applies
to workers exactly as it does to requests.

Cron schedule (Backend.md §10 table):
- purge_expired_auth_artifacts   daily 03:00
- expire_no_show_appointments    hourly
- refresh_catalog_cache          hourly
- reconcile_payments             every 15 min
- detect_anomalous_access        every 15 min
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import ClassVar

from arq import cron
from arq.connections import RedisSettings
from arq.cron import CronJob
from arq.typing import WorkerCoroutine

from app.core.config import get_settings
from app.core.db import dispose_engines, init_engines
from app.core.logging import configure_logging
from app.core.redis import close_redis
from app.core.telemetry import setup_telemetry
from app.workers.tasks import JobContext
from app.workers.tasks.documents import scan_document
from app.workers.tasks.maintenance import (
    expire_no_show_appointments,
    purge_expired_auth_artifacts,
    reconcile_payments,
    refresh_catalog_cache,
)
from app.workers.tasks.notifications import send_notification
from app.workers.tasks.security import detect_anomalous_access

OnStartup = Callable[[JobContext], Awaitable[None]]


async def on_startup(ctx: JobContext) -> None:
    logging.getLogger("arq").setLevel(logging.INFO)
    configure_logging()
    setup_telemetry()
    init_engines()


async def on_shutdown(ctx: JobContext) -> None:
    dispose_engines()
    await close_redis()


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(str(get_settings().redis_dsn))


class WorkerSettings:
    # tracked() already types the jobs as WorkerCoroutine (arq's loose ctx
    # protocol); the jobs keep their precise signatures.
    functions: ClassVar[list[WorkerCoroutine]] = [
        scan_document,
        send_notification,
        purge_expired_auth_artifacts,
        expire_no_show_appointments,
        refresh_catalog_cache,
        reconcile_payments,
        detect_anomalous_access,
    ]
    cron_jobs: ClassVar[list[CronJob]] = [
        cron(purge_expired_auth_artifacts, hour=3, minute=0, unique=True),
        cron(expire_no_show_appointments, hour=None, minute=0, unique=True),
        cron(refresh_catalog_cache, hour=None, minute=0, unique=True),
        cron(reconcile_payments, hour=None, minute={0, 15, 30, 45}, unique=True),
        cron(detect_anomalous_access, hour=None, minute={0, 15, 30, 45}, unique=True),
    ]
    on_startup: OnStartup = on_startup
    on_shutdown: OnStartup = on_shutdown
    redis_settings = _redis_settings()

    # Jobs are idempotent (Backend.md §10): retry with exponential backoff.
    retry_jobs = True
    job_retry_seconds = 30
    job_retry_max_seconds = 3600
    max_tries = 5
    keep_result = 3600
    keep_result_failed = 86400
    timeout = 600
    max_jobs = 8
