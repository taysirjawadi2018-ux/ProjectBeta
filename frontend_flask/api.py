"""HTTP client for the Watiq API.

This is the only module that talks to the backend. Everything else calls
`api.get(...)` / `api.post(...)` and gets parsed JSON or an ApiError.

Two things here are load-bearing:

1. **The access token never leaves the server.** It lives in the Flask session
   (Redis-backed) and is attached here as a Bearer header. Nothing is written
   to localStorage or to a readable cookie, which is what ADR-005 requires.

2. **The refresh cookie is replayed by hand.** The API sets `__Host-wtq_rt`
   with the Secure flag and reads it *only* from `request.cookies`
   (modules/auth/router.py) — the `RefreshIn.refresh_token` body field is
   accepted by the schema but never consulted. Over a plaintext in-cluster hop
   (http://api:8000) an httpx cookie jar discards a Secure cookie outright, so
   the value is captured from Set-Cookie and sent back as an explicit Cookie
   header. Do not "simplify" this into `client.cookies`.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from flask import current_app, g, has_request_context, session

log = logging.getLogger(__name__)

REFRESH_COOKIE = "__Host-wtq_rt"

# Session keys. Deliberately short: this is everything the BFF stores about a
# signed-in person. No name, national_id, email, phone or address — citizen PII
# is never written to Redis (Backend.md §7, ADR-003); it is fetched per request
# and rendered straight into the response.
S_ACCESS = "access_token"
S_REFRESH = "refresh_token"
S_ROLE = "role"
S_STAFF = "is_staff"
S_MFA = "mfa_required"


class ApiError(Exception):
    """A non-2xx response, carrying the API's RFC-7807 problem detail."""

    def __init__(self, status: int, title: str = "", detail: str = "", body: Any = None):
        super().__init__(f"{status} {title}")
        self.status = status
        self.title = title
        self.detail = detail
        self.body = body

    @property
    def is_auth(self) -> bool:
        return self.status in (401, 403)

    def user_message(self) -> str:
        """What is safe to show a citizen.

        The API's own messages are written for operators and can be specific
        enough to confirm that a record exists. 404 in particular must stay
        opaque: Security.md §7.3 makes BOLA return 404 rather than 403 precisely
        so it is not an existence oracle, and echoing "request 8813 belongs to
        another user" would hand that back.
        """
        return {
            400: "That request could not be processed. Please check the form and try again.",
            401: "Your session has expired. Please sign in again.",
            403: "You do not have permission to do that.",
            404: "Not found.",
            409: "That action conflicts with the current state of the record.",
            422: self.detail or "Some of the information provided is not valid.",
            429: "Too many attempts. Please wait a moment and try again.",
            503: "The service is temporarily unavailable. Please try again shortly.",
        }.get(self.status, "Something went wrong. Please try again.")


def _client() -> httpx.Client:
    """One connection pool per request context."""
    if has_request_context():
        c = g.get("_api_client")
        if c is None:
            c = g._api_client = httpx.Client(
                base_url=current_app.config["API_URL"],
                timeout=current_app.config["API_TIMEOUT"],
                follow_redirects=False,
            )
        return c
    return httpx.Client(
        base_url=current_app.config["API_URL"],
        timeout=current_app.config["API_TIMEOUT"],
    )


def close_client(_exc: BaseException | None = None) -> None:
    c = g.pop("_api_client", None) if has_request_context() else None
    if c is not None:
        c.close()


def capture_refresh_cookie(resp: httpx.Response) -> None:
    """Pull __Host-wtq_rt out of Set-Cookie by hand (see module docstring)."""
    for raw in resp.headers.get_list("set-cookie"):
        if raw.startswith(f"{REFRESH_COOKIE}="):
            session[S_REFRESH] = raw.split(";", 1)[0].split("=", 1)[1]
            return


def _headers(auth: bool, extra: dict[str, str] | None = None) -> dict[str, str]:
    h = {"Accept": "application/json"}
    if auth and session.get(S_ACCESS):
        h["Authorization"] = f"Bearer {session[S_ACCESS]}"
    rid = g.get("request_id") if has_request_context() else None
    if rid:
        h["X-Request-ID"] = rid
    if extra:
        h.update(extra)
    return h


def _parse(resp: httpx.Response) -> Any:
    if resp.status_code == 204 or not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _raise(resp: httpx.Response) -> None:
    body = _parse(resp)
    title = detail = ""
    if isinstance(body, dict):
        title = str(body.get("title", ""))
        detail = str(body.get("detail", ""))
        # 422 from FastAPI validation comes back as {"detail": [ ... ]}
        if isinstance(body.get("detail"), list):
            parts = [
                f"{'.'.join(str(x) for x in e.get('loc', [])[1:])}: {e.get('msg', '')}"
                for e in body["detail"]
            ]
            detail = "; ".join(p for p in parts if p.strip(": "))
    log.warning(
        "api_error", extra={"status": resp.status_code, "path": str(resp.url.path)}
    )
    raise ApiError(resp.status_code, title, detail, body)


def request(
    method: str,
    path: str,
    *,
    auth: bool = True,
    retry_auth: bool = True,
    headers: dict[str, str] | None = None,
    **kw: Any,
) -> Any:
    """Call the API. Refreshes once on 401, then gives up."""
    resp = _client().request(method, path, headers=_headers(auth, headers), **kw)

    if resp.status_code == 401 and auth and retry_auth and session.get(S_REFRESH):
        from auth import refresh_session  # circular at import time, fine here

        if refresh_session():
            resp = _client().request(
                method, path, headers=_headers(auth, headers), **kw
            )

    if resp.status_code >= 400:
        _raise(resp)
    return _parse(resp)


def get(path: str, **kw: Any) -> Any:
    return request("GET", path, **kw)


def post(path: str, **kw: Any) -> Any:
    return request("POST", path, **kw)


def patch(path: str, **kw: Any) -> Any:
    return request("PATCH", path, **kw)


def delete(path: str, **kw: Any) -> Any:
    return request("DELETE", path, **kw)


def try_get(path: str, default: Any = None, **kw: Any) -> Any:
    """For dashboard panels: one dead widget must not blank the whole page."""
    try:
        return get(path, **kw)
    except ApiError as e:
        log.info("panel_unavailable", extra={"path": path, "status": e.status})
        return default
    except httpx.HTTPError:
        log.info("panel_unreachable", extra={"path": path})
        return default


def items_of(data: Any) -> list[Any]:
    """Normalise a collection response to a list.

    The API returns bare lists from some endpoints (catalog/services,
    appointments/office) and `{items, total}` envelopes from the paginated ones.
    A template that iterates the wrong shape does not fail loudly — it iterates
    a dict's *keys* and then blows up on the first attribute access, producing a
    500 on a page that merely had no data. Normalising here keeps that shape
    mismatch from ever reaching a template.
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        items = data.get("items")
        return items if isinstance(items, list) else []
    return []


def total_of(data: Any, fallback: int = 0) -> int:
    if isinstance(data, dict) and isinstance(data.get("total"), int):
        return data["total"]
    if isinstance(data, list):
        return len(data)
    return fallback
