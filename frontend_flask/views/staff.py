"""Back-office: the office queue and the request review screen."""

from __future__ import annotations

from typing import Any

from flask import Blueprint, flash, redirect, render_template, request, url_for

import api
import auth
from auth import staff_required

# PATCH /requests/{id}/status takes StatusUpdateIn{new_status_code, reason} and
# forbids extra keys, so it wants the *code* from request_statuses, not the
# lookup id. These three are the decisions the review screen offers; the codes
# are the ones seeded in Watiq.sql. Surfaced to the template so the buttons do
# not hardcode workflow vocabulary in markup.
STATUS_CODES = {
    "approved": "approved",
    "rejected": "rejected",
    "resubmission": "pending_docs",
}

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
                status_codes=STATUS_CODES,
                staff=api.try_get("/api/v1/staff/me"),
            )
        request_id = items[0]["id"]

    return render_template(
        "verify_request.html",
        request_item=api.get(f"/api/v1/requests/{request_id}"),
        history=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/history")),
        documents=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/documents")),
        staff=api.try_get("/api/v1/staff/me"),
        status_codes=STATUS_CODES,
        permissions=(api.try_get("/api/v1/staff/me/permissions", default={}) or {}).get(
            "permissions", []
        ),
    )


@bp.post("/requests/<int:request_id>/assign")
@staff_required
def assign(request_id: int) -> Any:
    """Claim a request.

    The endpoint takes no body — it assigns to the calling officer and derives
    the staff id from the session, so a staff_id sent from the browser would be
    both ignored and a privilege question we should not be asking the client.
    """
    try:
        api.patch(f"/api/v1/requests/{request_id}/assign")
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("staff.review", request_id=request_id))
    flash("Request assigned to you.", "success")
    return redirect(url_for("staff.review", request_id=request_id))


@bp.post("/requests/<int:request_id>/status")
@staff_required
def set_status(request_id: int) -> Any:
    status_code = (request.form.get("status_code") or "").strip()
    if status_code not in STATUS_CODES.values():
        flash("Choose a decision before submitting.", "error")
        return redirect(url_for("staff.review", request_id=request_id))
    payload: dict[str, Any] = {"new_status_code": status_code}
    # StatusUpdateIn caps the reason at 2000 characters and forbids extra keys,
    # so it is sent only when the reviewer actually wrote one.
    reason = (request.form.get("reason") or "").strip()
    if reason:
        payload["reason"] = reason[:2000]
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
    """VerifyIn takes status: "verified" | "rejected" and forbids anything else."""
    status = "verified" if request.form.get("decision") == "accept" else "rejected"
    try:
        api.patch(f"/api/v1/documents/{document_id}/verify", json={"status": status})
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(request.referrer or url_for("staff.workbench"))
    flash(
        "Document accepted." if status == "verified" else "Document rejected.",
        "success",
    )
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
    """AppointmentStatusIn only accepts "completed" or "no_show"."""
    status = request.form.get("status", "")
    if status not in ("completed", "no_show"):
        flash("Choose whether the citizen attended.", "error")
        return redirect(url_for("staff.office_appointments"))
    try:
        api.patch(
            f"/api/v1/appointments/{appointment_id}/status", json={"status": status}
        )
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("staff.office_appointments"))
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


@bp.get("/health")
@staff_required
def health() -> str:
    """The auditor's monitoring console.

    Every tile here is a probe this process can actually make, timed on the
    spot: the BFF is up by definition (it is answering), the API is asked for
    its own /healthz, and the four data surfaces are the endpoints the portal
    depends on. Nothing is a stored metric — there is no metrics endpoint — so
    the page reports reachability and latency, and says so rather than drawing
    a CPU gauge it would have to invent.
    """
    import time

    def probe(label: str, path: str, *, auth_required: bool = True) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            if auth_required:
                api.get(path)
            else:
                api.request("GET", path, auth=False, retry_auth=False)
            status = "ok"
        except Exception as exc:  # noqa: BLE001
            status = "degraded" if isinstance(exc, api.ApiError) else "down"
        return {
            "label": label,
            "path": path,
            "status": status,
            "ms": round((time.perf_counter() - started) * 1000),
        }

    checks = [
        probe("Upstream API", "/healthz", auth_required=False),
        probe("Service catalogue", "/api/v1/catalog/services"),
        probe("Office directory", "/api/v1/catalog/offices"),
        probe("Request store", "/api/v1/requests/office/queue"),
        probe("Access log", "/api/v1/audit/access-log"),
    ]
    return render_template(
        "staff_health.html",
        checks=checks,
        healthy=sum(1 for c in checks if c["status"] == "ok"),
        staff=api.try_get("/api/v1/staff/me"),
    )
