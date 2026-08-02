"""Sign-in, token refresh and route guards.

The session holds tokens and the coarse role, nothing else. Anything shown on
screen — name, national ID, office — is fetched from the API on the request that
renders it and thrown away afterwards, so no citizen PII is written to Redis.
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any, TypeVar, cast

import httpx
from flask import flash, redirect, request, session, url_for

import api
from api import S_ACCESS, S_MFA, S_REFRESH, S_ROLE, S_STAFF, ApiError

F = TypeVar("F", bound=Callable[..., Any])


# --- session lifecycle ----------------------------------------------------
def _store(payload: dict[str, Any], *, staff: bool, role: str | None = None) -> None:
    session[S_ACCESS] = payload.get("access_token", "")
    session[S_STAFF] = staff
    session[S_MFA] = bool(payload.get("mfa_required", False))
    if role:
        session[S_ROLE] = role
    session.permanent = False


def login_citizen(login: str, password: str) -> None:
    resp = api._client().post(
        "/api/v1/auth/login",
        json={"login": login, "password": password},
        headers={"Accept": "application/json"},
    )
    if resp.status_code >= 400:
        api._raise(resp)
    api.capture_refresh_cookie(resp)
    _store(resp.json(), staff=False, role="citizen")


def login_staff(email: str, password: str) -> None:
    resp = api._client().post(
        "/api/v1/auth/login/staff",
        json={"email": email, "password": password},
        headers={"Accept": "application/json"},
    )
    if resp.status_code >= 400:
        api._raise(resp)
    api.capture_refresh_cookie(resp)
    _store(resp.json(), staff=True)
    # The role code decides which back-office screens are reachable. It comes
    # from the API rather than from anything the browser sent.
    try:
        me = api.get("/api/v1/staff/me")
        session[S_ROLE] = (me or {}).get("role_code") or "staff"
    except ApiError:
        session[S_ROLE] = "staff"


def refresh_session() -> bool:
    """Rotate the access token. Returns False if the session is finished."""
    token = session.get(S_REFRESH)
    if not token:
        return False
    try:
        resp = api._client().post(
            "/api/v1/auth/refresh",
            headers={
                "Accept": "application/json",
                # Replayed by hand — see api.py's module docstring.
                "Cookie": f"{api.REFRESH_COOKIE}={token}",
            },
        )
    except httpx.HTTPError:
        return False
    if resp.status_code >= 400:
        session.clear()
        return False
    api.capture_refresh_cookie(resp)
    body = resp.json()
    session[S_ACCESS] = body.get("access_token", "")
    session[S_MFA] = bool(body.get("mfa_required", False))
    return bool(session[S_ACCESS])


def logout() -> None:
    """Revoke server-side first; clear locally regardless of the outcome."""
    try:
        if session.get(S_ACCESS):
            api.post("/api/v1/auth/logout", retry_auth=False)
    except (ApiError, httpx.HTTPError):
        pass
    session.clear()


# --- state ----------------------------------------------------------------
def is_authenticated() -> bool:
    return bool(session.get(S_ACCESS))


def is_staff() -> bool:
    return bool(session.get(S_STAFF))


def role() -> str:
    return str(session.get(S_ROLE) or "")


def current_profile() -> dict[str, Any] | None:
    """The signed-in person, fetched fresh. Never cached — this is PII."""
    if not is_authenticated():
        return None
    path = "/api/v1/staff/me" if is_staff() else "/api/v1/auth/me"
    return api.try_get(path)


# --- guards ---------------------------------------------------------------
def login_required(fn: F) -> F:
    @functools.wraps(fn)
    def wrapper(*a: Any, **kw: Any) -> Any:
        if not is_authenticated():
            flash("Please sign in to continue.", "info")
            return redirect(url_for("public.login", next=request.path))
        return fn(*a, **kw)

    return cast(F, wrapper)


def staff_required(fn: F) -> F:
    @functools.wraps(fn)
    def wrapper(*a: Any, **kw: Any) -> Any:
        if not is_authenticated():
            flash("Please sign in to continue.", "info")
            return redirect(url_for("public.login", next=request.path, staff=1))
        if not is_staff():
            # Not 403: a citizen has no business learning that this route
            # exists at all.
            from flask import abort

            abort(404)
        return fn(*a, **kw)

    return cast(F, wrapper)


def admin_required(fn: F) -> F:
    @functools.wraps(fn)
    def wrapper(*a: Any, **kw: Any) -> Any:
        if not is_authenticated() or not is_staff():
            from flask import abort

            if not is_authenticated():
                flash("Please sign in to continue.", "info")
                return redirect(url_for("public.login", next=request.path, staff=1))
            abort(404)
        if role() not in ("admin", "director"):
            from flask import abort

            abort(404)
        return fn(*a, **kw)

    return cast(F, wrapper)
