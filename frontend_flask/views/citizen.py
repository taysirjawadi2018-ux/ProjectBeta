"""Citizen journeys: dashboard, requests, documents, appointments, payments."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_babel import gettext as _, lazy_gettext as _l

import api
import auth
from auth import login_required

bp = Blueprint("citizen", __name__)


def _split_by_half_day(slots: list[Any]) -> list[tuple[str, str, list[Any]]]:
    """Group slots into the Morning/Afternoon blocks the design draws.

    time_slot is a label, not a time — the API has shipped both "09:00–09:30"
    and "09:00 AM" — so the hour is parsed out and an unparseable label falls
    into the afternoon rather than disappearing from the page.
    """
    morning: list[Any] = []
    afternoon: list[Any] = []
    for item in slots:
        label = str(item.get("time_slot") or "")
        head = re.match(r"\s*(\d{1,2})", label)
        hour = int(head.group(1)) if head else 12
        if "pm" in label.lower() and hour < 12:
            hour += 12
        elif "am" in label.lower() and hour == 12:
            hour = 0
        (morning if hour < 12 else afternoon).append(item)
    return [
        ("Morning", "light_mode", morning),
        ("Afternoon", "partly_cloudy_day", afternoon),
    ]


@bp.get("/dashboard")
@login_required
def dashboard() -> str:
    """Panels degrade independently — one failing widget must not blank the page."""
    requests_ = api.items_of(api.try_get("/api/v1/requests"))

    # There is no "all my documents" endpoint — documents are listed per
    # request — so the Recent Documents panel is assembled from the three most
    # recent requests. Bounded on purpose: this is a dashboard, not an archive.
    documents: list[dict[str, Any]] = []
    for item in requests_[:3]:
        for document in api.items_of(
            api.try_get(f"/api/v1/requests/{item['id']}/documents")
        ):
            documents.append({**document, "request": item})

    return render_template(
        "citizen_dashboard.html",
        profile=auth.current_profile(),
        requests=requests_[:4],
        documents=documents[:4],
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


def _submit_context(office_id: int | None = None) -> dict[str, Any]:
    """Catalogue data for the new-request form.

    A request is filed against an office_service_id — the row that ties one
    service to one office — and that is only listable per office, so the
    office is chosen first and its services are fetched for it. Previously no
    template rendered this field at all, so every POST to /requests/new failed
    the `office_service_id` check and bounced straight back to the form.
    """
    if office_id is None:
        office_id = request.args.get("office_id", type=int)
    office_services = (
        api.items_of(api.try_get(f"/api/v1/catalog/offices/{office_id}/services"))
        if office_id
        else []
    )
    return {
        "services": api.items_of(api.try_get("/api/v1/catalog/services")),
        "offices": api.items_of(api.try_get("/api/v1/catalog/offices")),
        "office_services": [s for s in office_services if s.get("is_available", True)],
        "office_id": office_id,
        "profile": auth.current_profile(),
    }


@bp.route("/requests/new", methods=["GET", "POST"])
@login_required
def submit_request() -> Any:
    if request.method == "GET":
        return render_template("submit_request.html", form={}, **_submit_context())

    office_service_id = request.form.get("office_service_id", type=int)
    if not office_service_id:
        flash(_("Choose a service and an office before submitting."), "error")
        return redirect(url_for("citizen.submit_request"))

    # Everything not a control field is application data. The API enforces the
    # real limits on this (64 KB, depth 8, 200 keys) in requests/formdata.py;
    # this is only about not forwarding our own control fields.
    reserved = {"csrf_token", "office_service_id", "priority_id", "office_id"}
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
            form=request.form,
            **_submit_context(request.form.get("office_id", type=int)),
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
        flash(_("Choose a file to upload."), "error")
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


@bp.get("/requests/<int:request_id>/documents/new")
@login_required
def upload_page(request_id: int) -> str:
    """The upload screen. POSTs to upload_document above, which brokers the
    presigned PUT — the file never passes through this process."""
    return render_template(
        "document_upload.html",
        request_item=api.get(f"/api/v1/requests/{request_id}"),
        documents=api.items_of(
            api.try_get(f"/api/v1/requests/{request_id}/documents")
        ),
        profile=auth.current_profile(),
    )


# --- documents ------------------------------------------------------------
@bp.get("/documents")
@login_required
def documents() -> str:
    """Every document the citizen holds, assembled request by request.

    There is no "all my documents" endpoint — documents are listed per request
    — so this walks the request list and collects them. That is the whole
    reason the design's "My Documents" links used to point at /requests: the
    screen could not be built. It is bounded by the request page size rather
    than unbounded, and each document keeps a back-reference to its request so
    the detail route can address it without a second lookup.
    """
    requests_ = api.items_of(api.try_get("/api/v1/requests", params={"size": 50}))
    collected: list[dict[str, Any]] = []
    for item in requests_:
        for document in api.items_of(
            api.try_get(f"/api/v1/requests/{item['id']}/documents")
        ):
            collected.append({**document, "request": item})

    kind = (request.args.get("status") or "").strip().lower()
    if kind in ("verified", "pending", "rejected"):
        collected = [d for d in collected if str(d.get("status")) == kind]

    return render_template(
        "my_documents.html",
        documents=collected,
        status=kind,
        counts={
            key: sum(1 for d in collected if str(d.get("status")) == key)
            for key in ("verified", "pending", "rejected")
        },
        profile=auth.current_profile(),
    )


@bp.get("/requests/<int:request_id>/documents/<int:document_id>")
@login_required
def document_detail(request_id: int, document_id: int) -> Any:
    """One document, with the seal and audit trail its mockup draws.

    Addressed through its request because the API publishes no
    GET /documents/{id} — only the per-request listing — so the document is
    picked out of that list rather than fetched directly.
    """
    documents_ = api.items_of(
        api.try_get(f"/api/v1/requests/{request_id}/documents")
    )
    document = next((d for d in documents_ if d.get("id") == document_id), None)
    if document is None:
        flash(_("That document is not on this request."), "error")
        return redirect(url_for("citizen.documents"))
    return render_template(
        "document_detail.html",
        document=document,
        request_item=api.get(f"/api/v1/requests/{request_id}"),
        history=api.items_of(api.try_get(f"/api/v1/requests/{request_id}/history")),
        profile=auth.current_profile(),
    )


# --- security ------------------------------------------------------------
@bp.get("/security-log")
@login_required
def security_log() -> str:
    """The citizen's own access log.

    /api/v1/audit/access-log is the only access-event feed the API exposes and
    it is authorised server-side; whether a citizen may read their own rows is
    the API's call, not this one's. try_get means a 403 renders the empty state
    rather than an error page, so the screen is honest either way — and it
    lights up on its own the day the endpoint is scoped to self.
    """
    data = api.try_get("/api/v1/audit/access-log", default={}, params={"size": 50}) or {}
    return render_template(
        "security_log.html",
        entries=api.items_of(data),
        notifications=api.items_of(api.try_get("/api/v1/notifications"))[:5],
        profile=auth.current_profile(),
    )


@bp.post("/documents/<int:document_id>/confirm")
@login_required
def confirm_document(document_id: int) -> Any:
    api.post(f"/api/v1/documents/{document_id}/confirm")
    flash(_("Document uploaded. It will be checked by an officer."), "success")
    return redirect(request.referrer or url_for("citizen.requests_list"))


@bp.get("/documents/<int:document_id>/download")
@login_required
def download_document(document_id: int) -> Any:
    """Hand the browser the presigned URL as a redirect.

    The file is never proxied through this process, and the storage key never
    reaches the page: the API mints a 300-second presigned GET and we bounce
    to it. It is a redirect rather than an <img src> or a fetch because the
    CSP is default-src 'none' — a cross-origin object-storage URL would be
    refused as a subresource, but a top-level navigation is unaffected.

    Authorisation is the API's: it enforces owner-RLS for citizens and the
    document.download permission for staff, so both roles use this one route.
    """
    presigned = api.try_get(f"/api/v1/documents/{document_id}/download", default={}) or {}
    url = presigned.get("presigned_url") if isinstance(presigned, dict) else None
    if not url:
        flash(_("That document is not available for download right now."), "error")
        return redirect(request.referrer or url_for("citizen.requests_list"))
    return redirect(url)


@bp.post("/documents/<int:document_id>/delete")
@login_required
def delete_document(document_id: int) -> Any:
    api.delete(f"/api/v1/documents/{document_id}")
    flash(_("Document removed."), "info")
    return redirect(request.referrer or url_for("citizen.requests_list"))


# --- appointments ---------------------------------------------------------
@bp.route("/appointments/book", methods=["GET", "POST"])
@login_required
def book_appointment() -> Any:
    """The three-step booking wizard, driven by the query string.

    The mockup ran the steps in JavaScript over hardcoded offices and slots.
    They are decided here instead — no office_id means step 1, an office but no
    slot means step 2, a slot means step 3 — so the flow is bookmarkable, the
    back button works, and it does not depend on scripting.

    GET /appointments/slots requires *both* office_id and slot_date; sending
    neither returned 422 on every load, which is why no slot ever appeared.
    """
    if request.method == "POST":
        slot_id = request.form.get("slot_id", type=int)
        office_service_id = request.form.get("office_service_id", type=int)
        if not slot_id:
            flash(_("Choose a time slot to continue."), "error")
            return redirect(url_for("citizen.book_appointment"))
        if not office_service_id:
            flash(_("Choose which service the appointment is for."), "error")
            return redirect(
                url_for(
                    "citizen.book_appointment",
                    office_id=request.form.get("office_id", type=int),
                    slot_date=request.form.get("slot_date"),
                    slot_id=slot_id,
                )
            )
        payload: dict[str, Any] = {
            "slot_id": slot_id,
            "office_service_id": office_service_id,
        }
        if (request.form.get("reason") or "").strip():
            payload["reason"] = request.form["reason"].strip()[:2000]
        try:
            api.post("/api/v1/appointments", json=payload)
        except api.ApiError as exc:
            flash(
                _("That slot has just been taken. Please choose another.")if exc.status == 409
                else exc.user_message(),
                "error",
            )
            return redirect(url_for("citizen.book_appointment"))
        flash(_("Your appointment is booked."), "success")
        return redirect(url_for("citizen.appointments"))

    office_id = request.args.get("office_id", type=int)
    slot_id = request.args.get("slot_id", type=int)
    today = date.today()
    try:
        slot_date = date.fromisoformat(request.args.get("slot_date") or "")
    except ValueError:
        slot_date = today
    slot_date = max(slot_date, today)

    slots: list[Any] = []
    if office_id:
        slots = (
            api.try_get(
                "/api/v1/appointments/slots",
                default=[],
                params={"office_id": office_id, "slot_date": slot_date.isoformat()},
            )
            or []
        )

    offices = api.items_of(api.try_get("/api/v1/catalog/offices"))
    # The chosen office is resolved before the search filter is applied, so a
    # leftover ?q= cannot make the office of an in-progress booking vanish.
    office = next((o for o in offices if o.get("id") == office_id), None)

    # The office directory has no search endpoint, and it is a short list, so
    # the search box in the design filters the fetched rows here.
    query = (request.args.get("q") or "").strip()
    if query:
        needle = query.lower()
        offices = [
            o
            for o in offices
            if needle
            in " ".join(
                str(o.get(field) or "")
                for field in ("name", "name_fr", "city", "governorate", "address")
            ).lower()
        ]

    # The design's checkbox group. It is offered over the `type` column the
    # directory actually publishes ('municipality', 'court', ...) rather than
    # the mockup's hardcoded service names, which nothing in the API can match
    # an office against — a filter that can only ever return nothing is a dead
    # control with extra steps. The options come from the rows themselves, so
    # the list is never a box the citizen can tick to empty the results.
    office_types = sorted(
        {str(o.get("type")) for o in offices if o.get("type")}
    )
    selected_types = [t for t in request.args.getlist("type") if t in office_types]
    if selected_types:
        offices = [o for o in offices if str(o.get("type")) in selected_types]

    # The week strip runs Monday..Sunday around the chosen day, matching the
    # seven-column calendar in the design.
    week_start = slot_date - timedelta(days=slot_date.weekday())
    return render_template(
        "book_appointment.html",
        offices=offices,
        q=query,
        office_types=office_types,
        selected_types=selected_types,
        prev_week=(week_start - timedelta(days=7)).isoformat(),
        next_week=(week_start + timedelta(days=7)).isoformat(),
        office=office,
        office_id=office_id,
        office_services=[
            s
            for s in api.items_of(
                api.try_get(f"/api/v1/catalog/offices/{office_id}/services")
            )
            if s.get("is_available", True)
        ]
        if office_id
        else [],
        slots=slots,
        # The design groups the day into Morning and Afternoon. Splitting here
        # rather than in the template because the hour has to be parsed out of
        # a label, and a lexicographic compare in Jinja gets "9:00" wrong the
        # moment the API stops zero-padding.
        slot_groups=_split_by_half_day(slots),
        slot=next((s for s in slots if s.get("id") == slot_id), None),
        slot_date=slot_date,
        week=[week_start + timedelta(days=offset) for offset in range(7)],
        today=today,
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


@bp.get("/appointments/<int:appointment_id>")
@login_required
def appointment_detail(appointment_id: int) -> Any:
    """One appointment.

    The API publishes no GET /appointments/{id} — only the list, plus cancel
    and status — so the row is picked out of the list the citizen can already
    see. That keeps the authorisation exactly where it was: if it is not in
    their list, it is not theirs to read.
    """
    items = api.items_of(api.try_get("/api/v1/appointments", default={}))
    appointment = next((a for a in items if a.get("id") == appointment_id), None)
    if appointment is None:
        flash(_("That appointment is not on your record."), "error")
        return redirect(url_for("citizen.appointments"))
    return render_template(
        "appointment_detail.html",
        appointment=appointment,
        profile=auth.current_profile(),
    )


@bp.post("/appointments/<int:appointment_id>/cancel")
@login_required
def cancel_appointment(appointment_id: int) -> Any:
    api.post(f"/api/v1/appointments/{appointment_id}/cancel")
    flash(_("Appointment cancelled."), "info")
    return redirect(url_for("citizen.appointments"))


# --- notifications --------------------------------------------------------
@bp.get("/notifications")
@login_required
def notifications() -> str:
    """Notifications are cursor-paginated, not page-numbered.

    The list endpoint answers with {items, next_cursor, unread_count} and no
    total, so `next_cursor` is handed to the template and the "Load more"
    control becomes a link to the next page rather than a button that had
    nothing behind it.
    """
    cursor = request.args.get("cursor") or None
    data = (
        api.try_get(
            "/api/v1/notifications",
            default={},
            params={"cursor": cursor} if cursor else None,
        )
        or {}
    )
    return render_template(
        "notification_center.html",
        notifications=api.items_of(data),
        next_cursor=data.get("next_cursor") if isinstance(data, dict) else None,
        unread=data.get("unread_count") if isinstance(data, dict) else None,
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
    flash(_("All notifications marked as read."), "info")
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
