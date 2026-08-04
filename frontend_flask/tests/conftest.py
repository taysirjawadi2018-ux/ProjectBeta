"""Test fixtures for the Watiq BFF.

The API is stubbed at the httpx transport boundary, so the tests exercise the
real client, the real session handling and the real templates — everything
except the network hop.
"""

from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


# Representative payloads shaped like the API's response models
# (backend/app/modules/*/schemas.py).
FIXTURES: dict[str, Any] = {
    "GET /api/v1/auth/me": {
        "id": 1,
        "national_id": "12345678",
        "first_name": "Amal",
        "last_name": "Ben Salah",
        "email": "amal@example.tn",
    },
    # StaffMeOut has a single `name` column, unlike the citizen profile —
    # see backend/app/modules/staff/repository.py _GET_ME.
    "GET /api/v1/staff/me": {
        "id": 7,
        "name": "Karim Trabelsi",
        "email": "karim@watiq.tn",
        "office_id": 1,
        "office_name": "Tunis Municipality",
        "role_code": "admin",
        "role_name": "Administrator",
        "is_active": True,
    },
    "GET /api/v1/staff/me/permissions": {"permissions": ["request.review", "request.assign"]},
    "GET /api/v1/catalog/services": [
        {
            "id": 1, "code": "civil.birth_certificate", "slug": "birth-certificate",
            "name": "Birth Certificate", "name_fr": "Acte de naissance",
            "description": "Official copy of a birth record.", "description_fr": None,
            "base_fee": 5.0, "currency": "TND", "processing_time": 3, "is_digital": True,
            "legal_reference": None, "office_type": "municipality",
            "category_id": 1, "category_code": "civil",
        }
    ],
    "GET /api/v1/catalog/categories": [{"id": 1, "code": "civil", "name": "Civil Status"}],
    "GET /api/v1/catalog/offices": [
        {"id": 1, "name": "Tunis Municipality", "name_fr": "Municipalité de Tunis",
         "type": "municipality", "governorate": "Tunis", "city": "Tunis",
         "address": "Place de la Kasbah", "phone": "+216 71 000 000",
         "email": None, "latitude": None, "longitude": None, "opening_hours": None}
    ],
    # OfficeServiceOut: `id` is the office_service_id a request or an
    # appointment is filed against, and `catalog_id` points back at the service.
    "GET /api/v1/catalog/offices/1/services": [
        {"id": 31, "office_id": 1, "catalog_id": 1, "is_available": True,
         "fee_override": None, "processing_time_override": None, "notes": None,
         "code": "civil.birth_certificate", "slug": "birth-certificate",
         "name": "Birth Certificate", "name_fr": "Acte de naissance",
         "description": None, "base_fee": 5.0, "currency": "TND",
         "processing_time": 3, "is_digital": True}
    ],
    "GET /api/v1/requests": {
        "items": [
            {
                "id": 11, "tracking_code": "WTQ-2026-000011", "office_service_id": 1,
                "office_id": 1, "status_id": 2, "status_name": "Under review",
                "priority_id": None, "assigned_staff_id": None, "assigned_at": None,
                "form_data": {"full_name": "Amal Ben Salah"},
                "submitted_at": "2026-07-30T09:12:00Z", "estimated_ready_date": "2026-08-05",
                "service_name": "Birth Certificate",
            }
        ],
        "total": 1,
    },
    "GET /api/v1/requests/11": {
        "id": 11, "tracking_code": "WTQ-2026-000011", "office_service_id": 1,
        "office_id": 1, "status_id": 2, "status_name": "Under review",
        "priority_id": None, "assigned_staff_id": None, "assigned_at": None,
        "form_data": {"full_name": "Amal Ben Salah", "place_of_birth": "Tunis"},
        "submitted_at": "2026-07-30T09:12:00Z", "estimated_ready_date": "2026-08-05",
        "service_name": "Birth Certificate",
    },
    "GET /api/v1/requests/11/history": [
        {"status_name": "Submitted", "changed_at": "2026-07-30T09:12:00Z", "note": None}
    ],
    # DocumentOut carries no URL on purpose — the storage key never crosses the
    # boundary, so downloads go through GET /documents/{id}/download.
    "GET /api/v1/requests/11/documents": [
        {"id": 3, "document_type": "National ID scan", "mime_type": "application/pdf",
         "file_size_bytes": 245760, "status": "pending",
         "uploaded_at": "2026-07-30T09:12:30Z", "verified_at": None}
    ],
    "GET /api/v1/documents/3/download": {"presigned_url": "https://storage.example/d/3"},
    "GET /api/v1/requests/office/queue": {
        "items": [
            {
                "id": 11, "tracking_code": "WTQ-2026-000011", "status_name": "Under review",
                "office_service_id": 1, "office_id": 1, "status_id": 2,
                "priority_id": None, "assigned_staff_id": None, "assigned_at": None,
                "form_data": {}, "submitted_at": "2026-07-30T09:12:00Z",
                "estimated_ready_date": None, "service_name": "Birth Certificate",
            }
        ],
        "total": 1,
    },
    "GET /api/v1/requests/track/WTQ-2026-000011": {
        "tracking_code": "WTQ-2026-000011", "status_name": "Under review",
        "submitted_at": "2026-07-30T09:12:00Z", "estimated_ready_date": "2026-08-05",
        "service_name": "Birth Certificate", "office_name": "Tunis Municipality",
    },
    "GET /api/v1/appointments": {
        "items": [
            {
                "id": 4, "office_name": "Tunis Municipality", "slot_date": "2026-08-10",
                "time_slot": "09:00–09:30", "status": "booked",
                "service_name": "Birth Certificate",
            }
        ],
        "total": 1,
    },
    "GET /api/v1/appointments/slots": [
        {
            # office_service_id points at the office_services row (id 31), not
            # at the catalogue service — same key the booking payload carries.
            "id": 21, "office_id": 1, "office_name": "Tunis Municipality",
            "governorate": "Tunis", "office_service_id": 31, "slot_date": "2026-08-10",
            "time_slot": "09:00–09:30", "capacity": 4, "booked_count": 1, "seats_left": 3,
        }
    ],
    "GET /api/v1/appointments/office": [
        {"id": 4, "slot_date": "2026-08-10", "time_slot": "09:00–09:30",
         "status": "booked", "service_name": "Birth Certificate"}
    ],
    # Cursor-paginated, with no total — see NotificationListOut.
    "GET /api/v1/notifications": {
        "items": [
            {"id": 5, "type": "request_update", "title": "Your request was received",
             "message": "We have your birth certificate request.",
             "is_read": False, "request_id": 11, "sent_via": "in_app",
             "created_at": "2026-07-30T09:13:00Z"}
        ],
        "next_cursor": "eyJpZCI6NX0",
        "unread_count": 2,
    },
    "GET /api/v1/notifications/unread-count": {"unread_count": 2},
    "GET /api/v1/payments": {
        "items": [
            {"id": 9, "amount": 5.0, "currency": "TND", "status": "completed",
             "paid_at": "2026-07-30T09:20:00Z", "service_name": "Birth Certificate"}
        ],
        "total": 1,
    },
    "GET /api/v1/payments/9": {
        "id": 9, "amount": 5.0, "currency": "TND", "status": "completed",
        "paid_at": "2026-07-30T09:20:00Z", "service_name": "Birth Certificate",
    },
    "GET /api/v1/admin/users": {
        "items": [
            {"id": 1, "first_name": "Amal", "last_name": "Ben Salah",
             "national_id": "12345678", "is_active": True},
            {"id": 2, "first_name": "Sami", "last_name": "Gharbi",
             "national_id": "87654321", "is_active": False},
        ],
        "total": 2,
    },
    "GET /api/v1/admin/staff": [
        {"id": 7, "first_name": "Karim", "last_name": "Trabelsi",
         "role_name": "Administrator", "role_code": "admin",
         "office_name": "Tunis Municipality", "is_active": True}
    ],
    "GET /api/v1/admin/roles": [
        {"id": 1, "code": "clerk", "name": "Clerk",
         "description": "Processes citizen requests.", "permissions": ["request.review"]}
    ],
    "GET /api/v1/admin/permissions": [
        {"code": "request.review", "description": "Review submitted requests"},
        {"code": "request.assign", "description": "Assign requests to staff"},
    ],
}


# Every call the BFF makes, so a test can assert on the payload it sent and
# not just on the page it rendered. Several of the write paths were posting
# fields the API does not accept, which no render-only test can see.
SENT: list[dict[str, Any]] = []


def _handler(request: httpx.Request) -> httpx.Response:
    key = f"{request.method} {request.url.path}"
    body: Any = None
    if request.content:
        try:
            body = json.loads(request.content)
        except ValueError:
            body = request.content.decode("utf-8", "replace")
    SENT.append(
        {
            "method": request.method,
            "path": request.url.path,
            "params": dict(request.url.params),
            "json": body,
        }
    )
    if key in FIXTURES:
        return httpx.Response(200, json=FIXTURES[key])
    if request.method in ("POST", "PATCH", "DELETE"):
        return httpx.Response(200, json={"id": 11, "tracking_code": "WTQ-2026-000011"})
    return httpx.Response(
        404,
        json={"type": "about:blank", "title": "not_found", "status": 404,
              "detail": "No such resource."},
        headers={"Content-Type": "application/problem+json"},
    )


@pytest.fixture()
def app(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.setenv("SECRET_KEY", "test-key-not-for-production")
    # Drop the view packages too. They hold a module-level `import api`, so
    # reloading `api` without them leaves the views bound to the previous
    # module object and the monkeypatch below silently misses — which shows up
    # as real connection attempts, but only when tests run together.
    for mod in [
        m
        for m in list(sys.modules)
        if m in ("app", "config", "api", "auth", "screens") or m.startswith("views")
    ]:
        del sys.modules[mod]

    import api as api_module
    import app as app_module

    transport = httpx.MockTransport(_handler)

    def _mock_client() -> httpx.Client:
        from flask import current_app, g, has_request_context

        if has_request_context():
            c = g.get("_api_client")
            if c is None:
                c = g._api_client = httpx.Client(
                    base_url=current_app.config["API_URL"], transport=transport
                )
            return c
        return httpx.Client(base_url="http://api", transport=transport)

    monkeypatch.setattr(api_module, "_client", _mock_client)
    app_module.app.config.update(TESTING=True, WTF_CSRF_ENABLED=False)
    return app_module.app


@pytest.fixture()
def client(app: Any) -> Any:
    return app.test_client()


@pytest.fixture()
def sent(app: Any) -> Any:
    """The list of upstream API calls made during the test."""
    SENT.clear()
    return SENT


@pytest.fixture()
def citizen(client: Any) -> Any:
    """A signed-in citizen session."""
    with client.session_transaction() as sess:
        sess["access_token"] = "citizen-token"
        sess["refresh_token"] = "citizen-refresh"
        sess["is_staff"] = False
        sess["role"] = "citizen"
    return client


@pytest.fixture()
def admin(client: Any) -> Any:
    """A signed-in admin session."""
    with client.session_transaction() as sess:
        sess["access_token"] = "staff-token"
        sess["refresh_token"] = "staff-refresh"
        sess["is_staff"] = True
        sess["role"] = "admin"
    return client


def fixture_json(key: str) -> Any:
    return json.loads(json.dumps(FIXTURES[key]))
