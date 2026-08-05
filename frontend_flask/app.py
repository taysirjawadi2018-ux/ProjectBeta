"""Watiq National Portal — Flask presentation layer (BFF).

The twelve screens are a faithful port of the design mockups; this module wires
them to the FastAPI backend in ../backend.

It is a back-end-for-frontend, not a static site: the browser never receives an
API token. A form POST lands on a Flask route, which calls the API server-side
with a Bearer token held in a Redis-backed session, and renders the result into
Jinja. That keeps ADR-005 (no token in web storage) intact and means the pages
work with JavaScript disabled.

    python app.py                       # http://127.0.0.1:5000
    flask --app app run --debug
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

import httpx
from flask import Flask, g, render_template, request, session

import api
from config import Config, secret_key


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["SECRET_KEY"] = secret_key()

    # nginx terminates TLS and forwards X-Forwarded-Proto/For (see
    # ops/nginx/snippets/proxy-common.conf). Without this, Flask believes every
    # request is plain http: WTF_CSRF_SSL_STRICT rejects valid submissions and
    # url_for(_external=True) emits http:// links.
    #
    # x_for=1 trusts exactly one hop. nginx overwrites X-Forwarded-For using
    # $proxy_add_x_forwarded_for and only trusts the header itself from the
    # edge subnet, so the rightmost entry is the real client. A larger number
    # would let a client prepend its own address and forge the origin IP.
    if app.config["ENV"] != "dev":
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(  # type: ignore[method-assign]
            app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=0
        )

    logging.basicConfig(
        level=logging.DEBUG if app.config["DEBUG"] else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    _init_session(app)
    _init_csrf(app)
    _register_blueprints(app)
    _register_hooks(app)
    _register_error_handlers(app)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        """Liveness only — deliberately does not call the API.

        A health check that fails when its upstream is down turns a recoverable
        API blip into the orchestrator killing every frontend replica too.
        """
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz() -> tuple[dict[str, str], int]:
        """Readiness — this one does check the upstream."""
        try:
            api.request("GET", "/healthz", auth=False, retry_auth=False)
            upstream = "ok"
        except Exception:  # noqa: BLE001
            upstream = "error"
        body = {"status": "ok" if upstream == "ok" else "degraded", "api": upstream}
        return body, 200 if upstream == "ok" else 503

    return app


def _init_session(app: Flask) -> None:
    """Server-side sessions. Falls back to signed cookies only in dev.

    In production a cookie-backed session would put the access token in the
    browser — exactly what the BFF exists to avoid — so a missing Redis is a
    hard failure there rather than a silent downgrade.
    """
    try:
        import redis
        from flask_session import Session

        client = redis.from_url(app.config["REDIS_DSN"])
        client.ping()
        app.config["SESSION_REDIS"] = client
        Session(app)
        app.logger.info("session store: redis")
    except Exception as exc:  # noqa: BLE001 - any failure means no Redis
        if app.config["ENV"] != "dev":
            raise RuntimeError(
                f"Redis is required for server-side sessions outside dev: {exc}"
            ) from exc
        app.logger.warning(
            "Redis unavailable (%s) — falling back to signed-cookie sessions. "
            "Dev only: this places the access token in the browser cookie.",
            exc,
        )


def _init_csrf(app: Flask) -> None:
    from flask_wtf.csrf import CSRFProtect

    CSRFProtect(app)


def _register_blueprints(app: Flask) -> None:
    from views.admin import bp as admin_bp
    from views.citizen import bp as citizen_bp
    from views.public import bp as public_bp
    from views.staff import bp as staff_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(citizen_bp)
    app.register_blueprint(staff_bp)
    app.register_blueprint(admin_bp)


def _register_hooks(app: Flask) -> None:
    @app.before_request
    def _request_id() -> None:
        # Propagated to the API so one citizen action is greppable end to end.
        g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex

    @app.after_request
    def _echo_request_id(resp: Any) -> Any:
        resp.headers["X-Request-ID"] = g.get("request_id", "")
        return resp

    app.teardown_appcontext(api.close_client)

    @app.template_filter("display_name")
    def _display_name(profile: object) -> str:
        """Readable name for either kind of profile.

        The two /me endpoints disagree: GET /auth/me returns first_name and
        last_name, GET /staff/me returns a single `name` column. Templates that
        greet the signed-in person are rendered for both, so the difference is
        resolved once here instead of in every greeting.
        """
        if not isinstance(profile, dict):
            return ""
        name = (profile.get("name") or "").strip()
        if name:
            return name
        parts = [
            str(profile.get(field) or "").strip()
            for field in ("first_name", "last_name")
        ]
        return " ".join(part for part in parts if part)

    @app.context_processor
    def _globals() -> dict[str, object]:
        import auth

        return {
            "year": date.today().year,
            # Rendered as the starting value of the clock on the blocked page,
            # so it is correct before (and without) JavaScript.
            "now_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "is_authenticated": auth.is_authenticated(),
            "is_staff": auth.is_staff(),
            "current_role": auth.role(),
            # Rendered in every nav that shows a bell; None when signed out.
            "unread_count": _unread_count(),
        }


def _unread_count() -> int | None:
    import auth

    if not auth.is_authenticated() or auth.is_staff():
        return None
    data = api.try_get("/api/v1/notifications/unread-count", default=None)
    if isinstance(data, dict):
        # The endpoint answers {"unread_count": n}. Reading "count" instead
        # meant the badge was always 0 and never rendered.
        value = data.get("unread_count", data.get("count"))
        return int(value or 0)
    return int(data) if isinstance(data, int) else None


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(api.ApiError)
    def _api_error(exc: api.ApiError) -> tuple[str, int]:
        if exc.status == 401:
            session.clear()
        status = exc.status if exc.status in (401, 403, 404, 409, 429) else 502
        return (
            render_template(
                "error.html",
                code=status,
                title=_TITLES.get(status, "Something went wrong"),
                message=exc.user_message(),
            ),
            status,
        )

    @app.errorhandler(httpx.HTTPError)
    def _upstream_down(exc: httpx.HTTPError) -> tuple[str, int]:
        app.logger.error("api_unreachable: %s", exc)
        return (
            render_template(
                "error.html",
                code=503,
                title="Service unavailable",
                message="The portal cannot reach the records service right now. "
                "Please try again in a few minutes.",
            ),
            503,
        )

    @app.errorhandler(404)
    def _not_found(_e: Any) -> tuple[str, int]:
        return (
            render_template(
                "error.html",
                code=404,
                title="Page not found",
                message="That page does not exist, or you do not have access to it.",
            ),
            404,
        )

    @app.errorhandler(500)
    def _server_error(_e: Any) -> tuple[str, int]:
        return (
            render_template(
                "error.html",
                code=500,
                title="Something went wrong",
                message="An unexpected error occurred. The incident has been logged.",
            ),
            500,
        )


_TITLES = {
    401: "Session expired",
    403: "Not permitted",
    404: "Page not found",
    409: "Conflict",
    429: "Too many requests",
    502: "Service error",
}


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
