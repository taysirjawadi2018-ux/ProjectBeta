"""RFC 9457 (application/problem+json) exception handlers.

Backend.md §8. No SQL, table names, constraint text, or stack traces cross the
boundary. An InsufficientPrivilegeError (SQLSTATE 42501) means Layer 3 caught
what Layer 2 missed — it logs as an error and pages.
"""

from __future__ import annotations

from typing import Any

import structlog
from asyncpg.exceptions import InsufficientPrivilegeError
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.core.errors import (
    CONSTRAINT_ERRORS,
    AppError,
    RateLimited,
)

log: Any = structlog.get_logger()


def problem(request: Request, status: int, code: str, message: str,
            **details: Any) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": code,
        "status": status,
        "detail": message,
    }
    body.update(details)
    return JSONResponse(
        status_code=status,
        content=body,
        headers={"Content-Type": "application/problem+json"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        headers = {"Content-Type": "application/problem+json"}
        if isinstance(exc, RateLimited):
            headers["Retry-After"] = str(exc.details.get("retry_after_seconds", 60))
        return problem(request, exc.status_code, exc.code, exc.message,
                       **(exc.details or {}))

    @app.exception_handler(DBAPIError)
    async def handle_db_error(request: Request, exc: DBAPIError) -> JSONResponse:
        orig = getattr(exc, "orig", None)
        name = getattr(orig, "constraint_name", None)

        if name in CONSTRAINT_ERRORS:
            status, code, message = CONSTRAINT_ERRORS[name]
            if status >= 500:
                log.error("constraint_violation", constraint=name, exc_info=exc)
            return problem(request, status, code, message)

        if isinstance(orig, InsufficientPrivilegeError):
            # SQLSTATE 42501 — a column-level GRANT refused us. This is a
            # genuine server-side bug: the service tried to write something
            # its role may not. Never echo the SQL.
            log.error("privilege_denied", exc_info=exc)
            return problem(request, 403, "forbidden", "Operation not permitted.")

        log.error("unhandled_db_error", exc_info=exc)
        return problem(request, 500, "internal_error", "An internal error occurred.")

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = []
        for err in exc.errors():
            loc = ".".join(str(part) for part in err.get("loc", ()))
            errors.append({"field": loc, "message": err.get("msg", "invalid")})
        return problem(request, 422, "validation_error",
                       "Request validation failed.", errors=errors)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", exc_info=exc)
        return problem(request, 500, "internal_error", "An internal error occurred.")
