"""System administration.

Covers every endpoint in backend/app/modules/admin/router.py. No screen was
ever designed for this, so the layout is assembled from components that already
exist in the design system rather than invented wholesale.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_babel import gettext as _, lazy_gettext as _l

import api
from auth import admin_required

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.get("")
@admin_required
def index() -> str:
    tab = request.args.get("tab", "users")
    if tab not in ("users", "staff", "roles"):
        tab = "users"

    ctx: dict[str, Any] = {"tab": tab, "query": request.args.get("q", "")}

    if tab == "users":
        params: dict[str, Any] = {"page": request.args.get("page", type=int, default=1), "size": 25}
        if ctx["query"]:
            params["q"] = ctx["query"]
        data = api.try_get("/api/v1/admin/users", default={}, params=params) or {}
        ctx["users"] = api.items_of(data)
        ctx["total"] = api.total_of(data)
        ctx["page"] = params["page"]
    elif tab == "staff":
        ctx["staff_members"] = api.items_of(api.try_get("/api/v1/admin/staff"))
        ctx["roles"] = api.items_of(api.try_get("/api/v1/admin/roles"))
    else:
        ctx["roles"] = api.items_of(api.try_get("/api/v1/admin/roles"))
        ctx["permissions"] = api.items_of(api.try_get("/api/v1/admin/permissions"))

    return render_template("admin_management.html", **ctx)


# --- users ----------------------------------------------------------------
@bp.post("/users/<int:user_id>/deactivate")
@admin_required
def deactivate_user(user_id: int) -> Any:
    api.post(f"/api/v1/admin/users/{user_id}/deactivate")
    flash(_("Account deactivated."), "success")
    return redirect(url_for("admin.index", tab="users"))


@bp.post("/users/<int:user_id>/reactivate")
@admin_required
def reactivate_user(user_id: int) -> Any:
    api.post(f"/api/v1/admin/users/{user_id}/reactivate")
    flash(_("Account reactivated."), "success")
    return redirect(url_for("admin.index", tab="users"))


@bp.post("/users/<int:user_id>/anonymize")
@admin_required
def anonymize_user(user_id: int) -> Any:
    """Irreversible erasure (GDPR Art. 17).

    Two guards before the call: the operator must type the national ID to
    confirm, and must tick that stored documents were purged first. Order
    matters — fn_anonymize_user() severs the link between the person and their
    blobs, so anything still in object storage afterwards is orphaned and can no
    longer be found for deletion.
    """
    typed = (request.form.get("confirm_national_id") or "").strip()
    expected = (request.form.get("expected_national_id") or "").strip()
    if not typed or typed != expected:
        flash(
            _("Erasure cancelled: the national ID typed did not match the account."),
            "error",
        )
        return redirect(url_for("admin.index", tab="users"))
    if request.form.get("blobs_purged") != "yes":
        flash(
            _("Erasure cancelled: confirm that stored documents were purged first. Anonymising before purging orphans them permanently."),
            "error",
        )
        return redirect(url_for("admin.index", tab="users"))

    api.post(f"/api/v1/admin/users/{user_id}/anonymize")
    flash(_("Account anonymised. This cannot be undone."), "success")
    return redirect(url_for("admin.index", tab="users"))


# --- staff ----------------------------------------------------------------
@bp.post("/staff")
@admin_required
def create_staff() -> Any:
    payload = {
        k: v
        for k, v in {
            "email": (request.form.get("email") or "").strip(),
            "first_name": (request.form.get("first_name") or "").strip(),
            "last_name": (request.form.get("last_name") or "").strip(),
            "office_id": request.form.get("office_id", type=int),
            "role_id": request.form.get("role_id", type=int),
        }.items()
        if v
    }
    try:
        api.post("/api/v1/admin/staff", json=payload)
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("admin.index", tab="staff"))
    flash(_("Staff member created."), "success")
    return redirect(url_for("admin.index", tab="staff"))


@bp.post("/staff/<int:staff_id>/deactivate")
@admin_required
def deactivate_staff(staff_id: int) -> Any:
    api.post(f"/api/v1/admin/staff/{staff_id}/deactivate")
    flash(_("Staff account deactivated."), "success")
    return redirect(url_for("admin.index", tab="staff"))


@bp.post("/staff/<int:staff_id>/reactivate")
@admin_required
def reactivate_staff(staff_id: int) -> Any:
    api.post(f"/api/v1/admin/staff/{staff_id}/reactivate")
    flash(_("Staff account reactivated."), "success")
    return redirect(url_for("admin.index", tab="staff"))


# --- roles ----------------------------------------------------------------
@bp.post("/roles/<int:role_id>/permissions")
@admin_required
def update_role_permissions(role_id: int) -> Any:
    codes = request.form.getlist("permission")
    try:
        api.patch(
            f"/api/v1/admin/roles/{role_id}/permissions",
            json={"permissions": codes},
        )
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return redirect(url_for("admin.index", tab="roles"))
    flash(f"Permissions updated ({len(codes)} granted).", "success")
    return redirect(url_for("admin.index", tab="roles"))
