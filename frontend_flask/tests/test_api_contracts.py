"""What the BFF sends upstream must match the API's request models.

Rendering tests cannot catch a payload the API rejects: the page still returns
200 and the failure only appears when a real user presses the button. Each of
these guards a field name that was wrong, where the API declares
`extra="forbid"` and would answer 422 for every submission.
"""

from __future__ import annotations

from typing import Any


def _calls(sent: list[dict[str, Any]], method: str, path: str) -> list[dict[str, Any]]:
    return [c for c in sent if c["method"] == method and c["path"] == path]


def test_booking_sends_slot_and_office_service(citizen: Any, sent: Any) -> None:
    """AppointmentCreateIn requires office_service_id as well as slot_id."""
    citizen.post(
        "/appointments/book",
        data={"slot_id": "21", "office_service_id": "31", "office_id": "1"},
    )
    posted = _calls(sent, "POST", "/api/v1/appointments")
    assert posted, "no booking call was made"
    assert posted[0]["json"] == {"slot_id": 21, "office_service_id": 31}


def test_booking_without_a_service_never_reaches_the_api(
    citizen: Any, sent: Any
) -> None:
    citizen.post("/appointments/book", data={"slot_id": "21", "office_id": "1"})
    assert not _calls(sent, "POST", "/api/v1/appointments")


def test_slots_are_requested_with_office_and_date(citizen: Any, sent: Any) -> None:
    """GET /appointments/slots declares office_id and slot_date as required."""
    citizen.get("/appointments/book?office_id=1&slot_date=2026-08-10")
    asked = _calls(sent, "GET", "/api/v1/appointments/slots")
    assert asked, "the slots endpoint was never called"
    assert asked[0]["params"] == {"office_id": "1", "slot_date": "2026-08-10"}


def test_slots_are_not_requested_before_an_office_is_chosen(
    citizen: Any, sent: Any
) -> None:
    citizen.get("/appointments/book")
    assert not _calls(sent, "GET", "/api/v1/appointments/slots")


def test_status_decision_sends_a_status_code(admin: Any, sent: Any) -> None:
    """StatusUpdateIn takes new_status_code (a code), not a status_id."""
    admin.post(
        "/staff/requests/11/status",
        data={"status_code": "approved", "reason": "Documents check out."},
    )
    patched = _calls(sent, "PATCH", "/api/v1/requests/11/status")
    assert patched, "no status call was made"
    assert patched[0]["json"] == {
        "new_status_code": "approved",
        "reason": "Documents check out.",
    }


def test_an_unknown_status_code_is_refused_locally(admin: Any, sent: Any) -> None:
    admin.post("/staff/requests/11/status", data={"status_code": "not_a_status"})
    assert not _calls(sent, "PATCH", "/api/v1/requests/11/status")


def test_document_verification_sends_a_status_literal(admin: Any, sent: Any) -> None:
    """VerifyIn takes status: "verified" | "rejected"."""
    admin.post("/staff/documents/3/verify", data={"decision": "accept"})
    patched = _calls(sent, "PATCH", "/api/v1/documents/3/verify")
    assert patched and patched[0]["json"] == {"status": "verified"}

    sent.clear()
    admin.post("/staff/documents/3/verify", data={"decision": "reject"})
    patched = _calls(sent, "PATCH", "/api/v1/documents/3/verify")
    assert patched and patched[0]["json"] == {"status": "rejected"}


def test_assign_sends_no_body(admin: Any, sent: Any) -> None:
    """The endpoint assigns to the caller and takes no request model."""
    admin.post("/staff/requests/11/assign", data={"staff_id": "99"})
    patched = _calls(sent, "PATCH", "/api/v1/requests/11/assign")
    assert patched and not patched[0]["json"]


def test_appointment_status_is_restricted_to_the_allowed_values(
    admin: Any, sent: Any
) -> None:
    admin.post("/staff/appointments/4/status", data={"status": "cancelled"})
    assert not _calls(sent, "PATCH", "/api/v1/appointments/4/status")

    sent.clear()
    admin.post("/staff/appointments/4/status", data={"status": "no_show"})
    patched = _calls(sent, "PATCH", "/api/v1/appointments/4/status")
    assert patched and patched[0]["json"] == {"status": "no_show"}


def test_new_request_sends_an_office_service_id(citizen: Any, sent: Any) -> None:
    """RequestCreateIn requires office_service_id; control fields must not leak
    into form_data, which is stored verbatim as the citizen's answers."""
    citizen.post(
        "/requests/new",
        data={
            "office_service_id": "31",
            "office_id": "1",
            "cin": "12345678",
            "finalite": "Dossier de recrutement",
        },
    )
    posted = _calls(sent, "POST", "/api/v1/requests")
    assert posted, "no request was created"
    assert posted[0]["json"] == {
        "office_service_id": 31,
        "form_data": {"cin": "12345678", "finalite": "Dossier de recrutement"},
    }


def test_notifications_pass_the_cursor_through(citizen: Any, sent: Any) -> None:
    citizen.get("/notifications?cursor=abc123")
    asked = _calls(sent, "GET", "/api/v1/notifications")
    assert asked and asked[0]["params"] == {"cursor": "abc123"}


def test_unread_badge_reads_the_right_key(citizen: Any) -> None:
    """GET /notifications/unread-count answers {"unread_count": n}.

    The context processor read "count", so the bell badge was always 0 and the
    element never rendered.
    """
    body = citizen.get("/dashboard").data.decode()
    assert "2 unread" in body


def test_confirmation_step_names_the_service_the_slot_is_reserved_for(
    citizen: Any,
) -> None:
    """A slot that pins an office_service renders its name and posts it hidden.

    The lookup joins SlotOut.office_service_id to the office_services rows; if
    the two ever drift apart the page silently degrades to a generic label.
    """
    body = citizen.get(
        "/appointments/book?office_id=1&slot_date=2026-08-10&slot_id=21"
    ).data.decode()
    assert "Acte de naissance" in body
    assert 'name="office_service_id" type="hidden" value="31"' in body
