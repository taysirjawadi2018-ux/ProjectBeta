"""ASGI middleware: request-id, security headers, origin guard, body cap.

Security.md §3.3 (headers), §8.4 (origin), Architecture.md §7 (trust).
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import get_settings
from app.core.telemetry import instrumented_route

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), "
                          "payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
    # CSP: single-origin SPA, no inline script (Security.md §3.3).
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; "
        "style-src 'self'; img-src 'self' data:; font-src 'self'; "
        "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; "
        "base-uri 'none'; object-src 'none'; upgrade-insecure-requests",
}


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Assigns X-Request-ID (accepting a caller-supplied one for tracing
    correlation, sanitized) and binds it into structlog contextvars."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("x-request-id")
        if not request_id or len(request_id) > 64 or not (
            request_id.replace("-", "").replace("_", "").isalnum()
        ):
            request_id = uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.monotonic()
        request.state.start_time = start
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        duration_ms = int((time.monotonic() - start) * 1000)
        structlog.contextvars.bind_contextvars(
            route=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        instrumented_route(request, response.status_code)
        structlog.get_logger("watiq.request").info("request")
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests whose Origin is not on the allow-list.

    Security.md §8.4: a strict CORS allow-list, never '*'.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method in UNSAFE:
            origin = request.headers.get("origin")
            if origin and origin not in get_settings().cors_origins:
                return JSONResponse(
                    status_code=403,
                    content={
                        "type": "about:blank",
                        "title": "bad_origin",
                        "status": 403,
                        "detail": "Origin not allowed.",
                    },
                    headers={"Content-Type": "application/problem+json"},
                )
        return await call_next(request)


class BodySizeMiddleware(BaseHTTPMiddleware):
    """Hard cap on request bodies; anything larger is rejected up front.

    Nginx enforces 12m at the edge (Security.md §3.1); this is the in-app
    backstop so a misconfigured proxy cannot feed a giant JSONB body to the
    form_data parser.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = 12 * 1024 * 1024) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > self.max_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "type": "about:blank",
                    "title": "payload_too_large",
                    "status": 413,
                    "detail": "Request body too large.",
                },
                headers={"Content-Type": "application/problem+json"},
            )
        response = await call_next(request)
        if response.status_code < 400:
            response.headers.setdefault("Content-Type", "application/json")
        return response
