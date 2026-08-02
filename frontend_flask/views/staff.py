"""Back-office: the office queue and the request review screen."""

from __future__ import annotations

from typing import Any

from flask import Blueprint, flash, redirect, render_template, request, url_for

import api
import auth
from auth import staff_required

# request_status lookup ids, from the seed data in Watiq.sql. Surfaced to the
# template so the decision buttons do not hardcode numbers in markup. If the
# lookup table is ever reseeded, this is the single place to correct.
STATUS_IDS = {"approved": 5, "rejected": 6, "resubmission": 4}

bp = Blueprint("staff", __name__, url_prefix="/staff")


@bp.get("")
@staff_required
def workbench() -> str:
    page = request.args.get("page", type=int, default=1)
    queue = (
        api.try_get(
            "/api/v1/requests/office/queue", default={}, params={"page": page, "size": 25}
        )
        or {}
    )
    return render_template(
        "staff_workbench.html",
        queue=api.items_of(queue),
        total=api.total_of(queue),
        page=page,
        staff=api.try_get("/api/v1/staff/me"),
        permissions=(api.try_get("/api/v1/staff/me/permissions", default={}) or {}).get(
            "permissions", []
        ),
        appointments=api.items_of(api.try_get("/api/v1/appointments/office")),
    )


@bp.get("/review")
@bp.get("/review/<int:request_id>")
@staff_required
def review(request_id: int | None = None) -> Any:
    """The verification screen.

    Without an id it shows the next item in the queue, which is how an officer
    works through a shift; with one it deep-links to a specific request.
    """
    if request_id is None:
        queue = (
            api.try_get("/api/v1/requests/office/queue", default={}, params={"size": 1})
            or {}
        )
        items = api.items_of(queue)
        if not items:
            return render_template(
                "verify_request.html",
                request_item=None,
                history=[],
                documents=[],
                status_ids=STATUS_IDS,
                staff=api.try_get("/api/v1/staff/me"),
            )
        request_id = items[0]["id"]

    return render_template(
        "verify_request.html",
        request_item=api.get(f"/api/v1/requests/{request_id}"),
        history=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/history")),
        documents=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/documents")),
        staff=api.try_get("/api/v1/staff/me"),
        status_ids=STATUS_IDS,
        permissions=(api.try_get("/api/v1/staff/me/permissions", default={}) or {}).get(
            "permissions", []
        ),
    )


@bp.post("/requests/<int:request_id>/assign")
@staff_required
def assign(request_id: int) -> Any:
    payload: dict[str, Any] = {}
    if request.form.get("staff_id", type=int):
        payload["assigned_staff_id"] = request.form.get("staff_id", type=int)
    api.patch(f"/api/v1/requests/{request_id}/assign", json=payload)
    flash("Request assigned.", "success")
    return redirect(url_for("staff.review", request_id=request_id))


@bp.post("/requests/<int:request_id>/status")
@staff_required
def set_status(request_id: int) -> Any:
    status_id = request.form.get("status_id", type=int)
    if not status_id:
        flash("Choose a decision before submitting.", "error")
        return redirect(url_for("staff.review", request_id=request_id))
    payload: dict[str, Any] = {"status_id": status_id}
    if request.form.get("note"):
        payload["note"] = request.form["note"]
    try:
        api.patch(f"/api/v1/requests/{request_id}/status", json=payload)
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("staff.review", request_id=request_id))
    flash("Decision recorded.", "success")
    return redirect(url_for("staff.workbench"))


@bp.post("/documents/<int:document_id>/verify")
@staff_required
def verify_document(document_id: int) -> Any:
    api.patch(
        f"/api/v1/documents/{document_id}/verify",
        json={"is_verified": request.form.get("decision") == "accept"},
    )
    flash("Document reviewed.", "success")
    return redirect(request.referrer or url_for("staff.workbench"))


@bp.get("/appointments")
@staff_required
def office_appointments() -> str:
    return render_template(
        "staff_appointments.html",
        appointments=api.items_of(api.try_get("/api/v1/appointments/office")),
        staff=api.try_get("/api/v1/staff/me"),
    )


@bp.post("/appointments/<int:appointment_id>/status")
@staff_required
def appointment_status(appointment_id: int) -> Any:
    api.patch(
        f"/api/v1/appointments/{appointment_id}/status",
        json={"status": request.form.get("status", "")},
    )
    flash("Appointment updated.", "success")
    return redirect(url_for("staff.office_appointments"))


@bp.get("/audit")
@staff_required
def audit() -> str:
    """Access log. The API applies the real authorisation — a clerk without
    the audit permission gets a 403 from it, which surfaces as the error page."""
    page = request.args.get("page", type=int, default=1)
    data = (
        api.try_get(
            "/api/v1/audit/access-log", default={}, params={"page": page, "size": 50}
        )
        or {}
    )
    return render_template(
        "staff_audit.html",
        entries=api.items_of(data),
        total=api.total_of(data),
        page=page,
        staff=api.try_get("/api/v1/staff/me"),
    )
