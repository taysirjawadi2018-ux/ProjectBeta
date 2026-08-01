"""FastAPI application factory (Backend.md §2-3, Security.md §3.3).

Order of operations at startup is deliberate:
  1. settings load (fail fast if a secret is missing),
  2. structlog + telemetry,
  3. the five role engines (assert each can connect and set_config is safe),
  4. middleware registration (a request is instrumented no matter what),
  5. routers — a module import error here must kill the worker at boot,
     before it can serve anything.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.responses import Response

from app.core import __version__
from app.core.cache import cached
from app.core.config import get_settings
from app.core.db import dispose_engines, engine_for, init_engines
from app.core.exception_handlers import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import (
    BodySizeMiddleware,
    OriginGuardMiddleware,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.principal import DbRole
from app.core.redis import close_redis, get_redis
from app.core.telemetry import metrics_response, setup_telemetry
from app.modules.admin.router import router as admin_router
from app.modules.appointments.router import router as appointments_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.catalog.router import router as catalog_router
from app.modules.documents.router import router as documents_router
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.requests.router import router as requests_router
from app.modules.staff.router import router as staff_router
from app.modules.users.router import router as users_router

_APP_TITLE = "Watiq API"


async def _healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "time": int(__import__("time").time()),
    }


async def _readyz() -> dict[str, str]:
    """Liveness of the components Watiq cannot run without (Backend.md §6)."""
    checks: dict[str, str] = {}
    try:
        async with engine_for(DbRole.AUTH).connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
    try:
        r = get_redis()
        if not await r.ping():
            checks["redis"] = "error"
        else:
            checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
    checks["status"] = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return checks


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    configure_logging(debug=s.debug)
    setup_telemetry()
    init_engines()          # raises -> worker refuses to boot
    await cached("heartbeat", 60, _healthz)   # warm Redis path
    yield
    await close_redis()
    dispose_engines()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=_APP_TITLE,
        version=__version__,
        docs_url="/docs" if settings.debug else None,
        redoc_url=None if not settings.debug else "/redoc",
        openapi_url="/openapi.json" if settings.debug else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,   # Security.md §8.4, never "*"
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID",
                       "Idempotency-Key", "X-CSRF-Token", "X-Device-ID"],
        max_age=600,
    )
    app.add_middleware(BodySizeMiddleware)
    app.add_middleware(OriginGuardMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(catalog_router)
    app.include_router(requests_router)
    app.include_router(documents_router)
    app.include_router(appointments_router)
    app.include_router(payments_router)
    app.include_router(notifications_router)
    app.include_router(staff_router)
    app.include_router(audit_router)
    app.include_router(admin_router)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, Any]:
        return await _healthz()

    @app.get("/readyz", include_in_schema=False)
    async def readyz() -> dict[str, str]:
        return await _readyz()

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return metrics_response()

    # Placeholder until Phase 5 modules land.
    @app.get("/api/v1")
    async def api_root() -> dict[str, str]:
        return {"service": _APP_TITLE, "version": __version__}

    return app


app = create_app()
