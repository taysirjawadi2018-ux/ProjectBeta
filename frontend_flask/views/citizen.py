"""Citizen journeys: dashboard, requests, documents, appointments, payments."""

from __future__ import annotations

from typing import Any

from flask import Blueprint, flash, redirect, render_template, request, url_for

import api
import auth
from auth import login_required

bp = Blueprint("citizen", __name__)


@bp.get("/dashboard")
@login_required
def dashboard() -> str:
    """Panels degrade independently — one failing widget must not blank the page."""
    return render_template(
        "citizen_dashboard.html",
        profile=auth.current_profile(),
        requests=api.items_of(api.try_get("/api/v1/requests")),
        appointments=api.items_of(api.try_get("/api/v1/appointments")),
        notifications=api.items_of(api.try_get("/api/v1/notifications"))[:5],
    )


# --- requests -------------------------------------------------------------
@bp.get("/requests")
@login_required
def requests_list() -> str:
    page = request.args.get("page", type=int, default=1)
    status = request.args.get("status") or None
    params: dict[str, Any] = {"page": page, "size": 20}
    if status:
        params["status"] = status
    data = api.try_get("/api/v1/requests", default={}, params=params) or {}
    return render_template(
        "my_requests.html",
        requests=api.items_of(data),
        total=api.total_of(data),
        page=page,
        status=status,
        profile=auth.current_profile(),
    )


@bp.get("/requests/<int:request_id>")
@login_required
def request_detail(request_id: int) -> str:
    detail = api.get(f"/api/v1/requests/{request_id}")
    return render_template(
        "request_detail.html",
        request_item=detail,
        history=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/history")),
        documents=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/documents")),
        profile=auth.current_profile(),
    )


@bp.route("/requests/new", methods=["GET", "POST"])
@login_required
def submit_request() -> Any:
    if request.method == "GET":
        return render_template(
            "submit_request.html",
            services=api.items_of(api.try_get("/api/v1/catalog/services")),
            offices=api.items_of(api.try_get("/api/v1/catalog/offices")),
            profile=auth.current_profile(),
            form={},
        )

    office_service_id = request.form.get("office_service_id", type=int)
    if not office_service_id:
        flash("Choose a service and an office before submitting.", "error")
        return redirect(url_for("citizen.submit_request"))

    # Everything not a control field is application data. The API enforces the
    # real limits on this (64 KB, depth 8, 200 keys) in requests/formdata.py;
    # this is only about not forwarding our own control fields.
    reserved = {"csrf_token", "office_service_id", "priority_id"}
    form_data = {
        k: v for k, v in request.form.items() if k not in reserved and v.strip()
    }

    payload: dict[str, Any] = {
        "office_service_id": office_service_id,
        "form_data": form_data,
    }
    if request.form.get("priority_id", type=int):
        payload["priority_id"] = request.form.get("priority_id", type=int)

    try:
        created = api.post("/api/v1/requests", json=payload)
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return render_template(
            "submit_request.html",
            services=api.items_of(api.try_get("/api/v1/catalog/services")),
            offices=api.items_of(api.try_get("/api/v1/catalog/offices")),
            profile=auth.current_profile(),
            form=request.form,
        ), exc.status

    flash(
        f"Request submitted. Your tracking code is {created.get('tracking_code', '')}.",
        "success",
    )
    return redirect(url_for("citizen.request_detail", request_id=created["id"]))


@bp.post("/requests/<int:request_id>/documents")
@login_required
def upload_document(request_id: int) -> Any:
    """Broker the presigned upload.

    The file itself goes browser -> object storage; it never passes through
    this process. Flask only asks for the presigned URL and confirms afterwards.
    """
    filename = (request.form.get("filename") or "").strip()
    content_type = request.form.get("content_type") or "application/octet-stream"
    if not filename:
        flash("Choose a file to upload.", "error")
        return redirect(url_for("citizen.request_detail", request_id=request_id))
    try:
        presigned = api.post(
            f"/api/v1/requests/{request_id}/documents",
            json={"filename": filename, "content_type": content_type},
        )
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("citizen.request_detail", request_id=request_id))
    return {"upload": presigned}, 200


@bp.post("/documents/<int:document_id>/confirm")
@login_required
def confirm_document(document_id: int) -> Any:
    api.post(f"/api/v1/documents/{document_id}/confirm")
    flash("Document uploaded. It will be checked by an officer.", "success")
    return redirect(request.referrer or url_for("citizen.requests_list"))


@bp.post("/documents/<int:document_id>/delete")
@login_required
def delete_document(document_id: int) -> Any:
    api.delete(f"/api/v1/documents/{document_id}")
    flash("Document removed.", "info")
    return redirect(request.referrer or url_for("citizen.requests_list"))


# --- appointments ---------------------------------------------------------
@bp.route("/appointments/book", methods=["GET", "POST"])
@login_required
def book_appointment() -> Any:
    if request.method == "POST":
        slot_id = request.form.get("slot_id", type=int)
        if not slot_id:
            flash("Choose a time slot to continue.", "error")
            return redirect(url_for("citizen.book_appointment"))
        try:
            api.post("/api/v1/appointments", json={"slot_id": slot_id})
        except api.ApiError as exc:
            flash(
                "That slot has just been taken. Please choose another."
                if exc.status == 409
                else exc.user_message(),
                "error",
            )
            return redirect(url_for("citizen.book_appointment"))
        flash("Your appointment is booked.", "success")
        return redirect(url_for("citizen.appointments"))

    params = {
        k: v
        for k, v in (
            ("office_id", request.args.get("office_id", type=int)),
            ("service_id", request.args.get("service_id", type=int)),
            ("date_from", request.args.get("date_from")),
        )
        if v
    }
    return render_template(
        "book_appointment.html",
        slots=api.try_get("/api/v1/appointments/slots", default=[], params=params) or [],
        offices=api.items_of(api.try_get("/api/v1/catalog/offices")),
        services=api.items_of(api.try_get("/api/v1/catalog/services")),
        selected=params,
        profile=auth.current_profile(),
    )


@bp.get("/appointments")
@login_required
def appointments() -> str:
    data = api.try_get("/api/v1/appointments", default={}) or {}
    return render_template(
        "appointments.html",
        appointments=api.items_of(data),
        profile=auth.current_profile(),
    )


@bp.post("/appointments/<int:appointment_id>/cancel")
@login_required
def cancel_appointment(appointment_id: int) -> Any:
    api.post(f"/api/v1/appointments/{appointment_id}/cancel")
    flash("Appointment cancelled.", "info")
    return redirect(url_for("citizen.appointments"))


# --- notifications --------------------------------------------------------
@bp.get("/notifications")
@login_required
def notifications() -> str:
    data = api.try_get("/api/v1/notifications", default={}) or {}
    return render_template(
        "notification_center.html",
        notifications=api.items_of(data),
        total=api.total_of(data),
        profile=auth.current_profile(),
    )


@bp.post("/notifications/<int:notification_id>/read")
@login_required
def mark_read(notification_id: int) -> Any:
    api.post(f"/api/v1/notifications/{notification_id}/read")
    return redirect(url_for("citizen.notifications"))


@bp.post("/notifications/read-all")
@login_required
def mark_all_read() -> Any:
    api.post("/api/v1/notifications/read-all")
    flash("All notifications marked as read.", "info")
    return redirect(url_for("citizen.notifications"))


# --- payments -------------------------------------------------------------
@bp.get("/payments")
@login_required
def payments() -> str:
    data = api.try_get("/api/v1/payments", default={}) or {}
    return render_template(
        "payments.html", payments=api.items_of(data), profile=auth.current_profile()
    )


@bp.get("/payments/confirmation")
@login_required
def payment_confirmation() -> str:
    """Landing page after a payment. `id` selects one; otherwise show the latest."""
    payment_id = request.args.get("id", type=int)
    payment = None
    if payment_id:
        payment = api.try_get(f"/api/v1/payments/{payment_id}")
    if payment is None:
        items = api.items_of(api.try_get("/api/v1/payments"))
        payment = items[0] if items else None
    return render_template(
        "payment_confirmation.html", payment=payment, profile=auth.current_profile()
    )


# --- profile --------------------------------------------------------------
@bp.get("/profile")
@login_required
def profile() -> str:
    """Account settings.

    Read-only for now: the API exposes GET /users/me and GET /staff/me but no
    citizen-facing update endpoint, so this shows the record and does not
    pretend it can be edited here.
    """
    return render_template("profile.html", profile=auth.current_profile())
