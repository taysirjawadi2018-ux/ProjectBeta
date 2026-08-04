"""Every route renders, and the guards actually guard."""

from __future__ import annotations

from typing import Any

import pytest

PUBLIC_GETS = [
    "/", "/login", "/register", "/services", "/track",
    "/legal/privacy", "/legal/terms", "/accessibility",
    "/contact", "/about", "/help", "/password-reset",
]

CITIZEN_GETS = [
    "/dashboard", "/requests", "/requests/11", "/requests/new",
    # /requests/new only renders the office_service_id field once an office is
    # chosen, so the second form of the page needs covering too.
    "/requests/new?office_id=1",
    "/appointments", "/notifications",
    "/payments", "/payments/confirmation",
    # The booking wizard is three server-rendered steps selected by the query
    # string: office list, then that office's slots, then the confirmation.
    "/appointments/book",
    "/appointments/book?office_id=1",
    "/appointments/book?office_id=1&slot_date=2026-08-10",
    "/appointments/book?office_id=1&slot_date=2026-08-10&slot_id=21",
]

STAFF_GETS = ["/staff", "/staff/review", "/staff/review/11", "/staff/appointments"]


@pytest.mark.parametrize("path", PUBLIC_GETS)
def test_public_pages_render(client: Any, path: str) -> None:
    resp = client.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}"
    assert b"<html" in resp.data


@pytest.mark.parametrize("path", CITIZEN_GETS)
def test_citizen_pages_render(citizen: Any, path: str) -> None:
    resp = citizen.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}"


@pytest.mark.parametrize("path", STAFF_GETS)
def test_staff_pages_render(admin: Any, path: str) -> None:
    resp = admin.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}"


@pytest.mark.parametrize("tab", ["users", "staff", "roles"])
def test_admin_tabs_render(admin: Any, tab: str) -> None:
    resp = admin.get(f"/admin?tab={tab}")
    assert resp.status_code == 200
    assert b"Administration" in resp.data


# --- guards ---------------------------------------------------------------
@pytest.mark.parametrize("path", CITIZEN_GETS)
def test_citizen_pages_require_sign_in(client: Any, path: str) -> None:
    resp = client.get(path)
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_staff_area_is_404_for_a_citizen(citizen: Any) -> None:
    """Not 403.

    A 403 confirms the route exists; Security.md §7.3 makes the API answer 404
    for exactly this reason, and the UI must not undo it.
    """
    assert citizen.get("/staff").status_code == 404


def test_admin_area_is_404_for_a_citizen(citizen: Any) -> None:
    assert citizen.get("/admin").status_code == 404


def test_admin_area_is_404_for_non_admin_staff(client: Any) -> None:
    with client.session_transaction() as sess:
        sess["access_token"] = "clerk-token"
        sess["is_staff"] = True
        sess["role"] = "clerk"
    assert client.get("/admin").status_code == 404


def test_unknown_page_renders_the_error_template(client: Any) -> None:
    resp = client.get("/no-such-page")
    assert resp.status_code == 404
    assert b"Page not found" in resp.data


def test_open_redirect_is_refused(client: Any) -> None:
    """?next= must not be able to bounce a signed-in user off-site."""
    resp = client.post(
        "/login?next=https://evil.example/",
        data={"cin": "12345678", "password": "hunter2hunter2"},
    )
    assert resp.status_code == 302
    assert "evil.example" not in resp.headers["Location"]


def test_review_survives_an_empty_queue(client: Any, monkeypatch: Any) -> None:
    """A clerk who has cleared the queue must not get a 500.

    /staff/review with no id shows the next item; with an empty queue there is
    no item, and the decision form used to build url_for(..., request_id=None).
    """
    import httpx

    import api

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/requests/office/queue":
            return httpx.Response(200, json={"items": [], "total": 0})
        if request.url.path == "/api/v1/staff/me":
            return httpx.Response(200, json={"id": 7, "role_code": "clerk"})
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        api, "_client", lambda: httpx.Client(base_url="http://api", transport=transport)
    )
    with client.session_transaction() as sess:
        sess["access_token"] = "t"
        sess["is_staff"] = True
        sess["role"] = "clerk"
    resp = client.get("/staff/review")
    assert resp.status_code == 200
    assert b"queue is empty" in resp.data
