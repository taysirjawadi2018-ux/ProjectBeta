"""Configuration for the Watiq BFF.

Secrets are read from a file when a *_FILE variable is present, so production
can mount them at /run/secrets/ instead of putting them in the environment
where `docker inspect` exposes them (Security.md §12.4).
"""

from __future__ import annotations

import os
import pathlib
import secrets


def _from_env_or_file(name: str, default: str | None = None) -> str | None:
    """Prefer <NAME>_FILE over <NAME>; secrets belong on disk, not in env."""
    path = os.environ.get(f"{name}_FILE")
    if path:
        return pathlib.Path(path).read_text().strip()
    return os.environ.get(name, default)


class Config:
    ENV = os.environ.get("ENV", "dev")
    DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

    # --- Upstream API -----------------------------------------------------
    API_URL = os.environ.get("WATIQ_API_URL", "http://127.0.0.1:8000").rstrip("/")
    API_TIMEOUT = float(os.environ.get("WATIQ_API_TIMEOUT", "10"))

    # --- Session ----------------------------------------------------------
    # Server-side, Redis-backed. The cookie carries an opaque session id only;
    # tokens never reach the browser.
    SESSION_TYPE = "redis"
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = "wtq:fe:sess:"
    SESSION_COOKIE_NAME = "wtq_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    # Lax rather than Strict: Strict would drop the cookie on a top-level
    # navigation back from an external payment gateway, silently logging the
    # citizen out mid-transaction.
    SESSION_COOKIE_SECURE = ENV != "dev"

    REDIS_DSN = _from_env_or_file("REDIS_DSN", "redis://127.0.0.1:6379/1")

    # --- CSRF -------------------------------------------------------------
    # The BFF authenticates form POSTs with a cookie, so it needs its own CSRF
    # defence. The API's OriginGuardMiddleware protects the API from browsers,
    # not this server from forged form posts.
    WTF_CSRF_TIME_LIMIT = None      # tied to the session, not a fixed clock
    WTF_CSRF_SSL_STRICT = ENV != "dev"

    MAX_CONTENT_LENGTH = 12 * 1024 * 1024   # mirrors the API's BodySizeMiddleware


def secret_key() -> str:
    """Fail fast in production rather than silently minting a per-process key.

    An ephemeral key would log every user out on each restart and, with more
    than one replica, on every request that lands on a different worker.
    """
    key = _from_env_or_file("SECRET_KEY")
    if key:
        return key
    if Config.ENV != "dev":
        raise RuntimeError(
            "SECRET_KEY (or SECRET_KEY_FILE) must be set outside dev — "
            "a generated key invalidates every session on restart."
        )
    return secrets.token_hex(32)
