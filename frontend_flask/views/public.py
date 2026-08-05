"""Routes reachable without a session."""

from __future__ import annotations

from typing import Any

from flask import (
    Blueprint,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

import api
import auth

bp = Blueprint("public", __name__)

# Only relative paths, and only ones Flask itself routes. Without this an
# attacker can hand someone a link with ?next=https://evil.example and the
# post-login redirect becomes an open redirect.
def _safe_next(target: str | None) -> str:
    if not target or not target.startswith("/") or target.startswith("//"):
        return url_for("citizen.dashboard")
    return target


@bp.get("/")
def index() -> str:
    return render_template("index.html")


# --- sign in / register ---------------------------------------------------
@bp.route("/login", methods=["GET", "POST"])
def login() -> Any:
    staff_mode = request.args.get("staff") == "1" or request.form.get("mode") == "staff"
    if request.method == "GET":
        return render_template("login.html", staff_mode=staff_mode)

    identifier = (request.form.get("cin") or request.form.get("email") or "").strip()
    password = request.form.get("password") or ""
    if not identifier or not password:
        flash("Enter your credentials to continue.", "error")
        return render_template("login.html", staff_mode=staff_mode), 400

    try:
        if staff_mode:
            auth.login_staff(identifier, password)
        else:
            auth.login_citizen(identifier, password)
    except api.ApiError as exc:
        # One message for every failure mode. Distinguishing "no such account"
        # from "wrong password" turns this form into an account enumerator.
        flash(
            "Those credentials were not recognised."
            if exc.status in (400, 401, 404)
            else exc.user_message(),
            "error",
        )
        return render_template("login.html", staff_mode=staff_mode), 401

    if session.get(api.S_MFA):
        return redirect(url_for("public.mfa"))
    if auth.is_staff():
        return redirect(url_for("staff.workbench"))
    return redirect(_safe_next(request.args.get("next")))


@bp.route("/login/mfa", methods=["GET", "POST"])
def mfa() -> Any:
    """Step-up for a partial staff session (Backend.md §6.4)."""
    if not auth.is_authenticated():
        return redirect(url_for("public.login", staff=1))
    if request.method == "GET":
        return render_template("mfa.html", profile=auth.current_profile())

    # The design splits the code across six single-character boxes, all named
    # "code". Joining the list means the form works with JavaScript disabled;
    # a single "code" field still works for anything that posts one.
    digits = [part.strip() for part in request.form.getlist("code") if part.strip()]
    code = "".join(digits) if len(digits) > 1 else (request.form.get("code") or "").strip()
    try:
        resp = api._client().post(
            "/api/v1/auth/mfa/complete",
            json={"code": code},
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {session.get(api.S_ACCESS, '')}",
            },
        )
        if resp.status_code >= 400:
            api._raise(resp)
        api.capture_refresh_cookie(resp)
        body = resp.json()
        session[api.S_ACCESS] = body.get("access_token", "")
        session[api.S_MFA] = False
    except api.ApiError as exc:
        flash("That code was not accepted." if exc.status in (400, 401, 403, 404)
              else exc.user_message(), "error")
        return render_template("mfa.html", profile=auth.current_profile()), 401
    return redirect(url_for("staff.workbench"))


@bp.route("/register", methods=["GET", "POST"])
def register() -> Any:
    if request.method == "GET":
        return render_template("register.html", form={})

    form = {k: (v or "").strip() for k, v in request.form.items() if k != "csrf_token"}
    payload: dict[str, Any] = {
        "national_id": form.get("national_id", ""),
        "first_name": form.get("first_name", ""),
        "last_name": form.get("last_name", ""),
        "password": request.form.get("password", ""),
    }
    for optional in ("email", "phone", "date_of_birth", "governorate", "city"):
        if form.get(optional):
            payload[optional] = form[optional]

    if payload["password"] != request.form.get("password_confirm", ""):
        flash("The two passwords do not match.", "error")
        return render_template("register.html", form=form), 400

    try:
        api.post("/api/v1/auth/register", json=payload, auth=False)
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return render_template("register.html", form=form), exc.status

    try:
        auth.login_citizen(payload["national_id"], payload["password"])
    except api.ApiError:
        flash("Account created. Please sign in.", "success")
        return redirect(url_for("public.login"))
    flash("Welcome to Watiq. Your account is ready.", "success")
    return redirect(url_for("citizen.dashboard"))


@bp.post("/logout")
def logout() -> Any:
    auth.logout()
    flash("You have been signed out.", "info")
    return redirect(url_for("public.index"))


@bp.route("/password-reset", methods=["GET", "POST"])
def password_reset() -> Any:
    if request.method == "GET":
        return render_template("password_reset.html", stage=request.args.get("stage", "request"))
    stage = request.form.get("stage", "request")
    try:
        if stage == "request":
            api.post(
                "/api/v1/auth/password-reset/request",
                json={"login": (request.form.get("login") or "").strip()},
                auth=False,
            )
            # Always the same response: no account-existence oracle.
            flash("If that account exists, a reset code has been sent.", "info")
            return redirect(url_for("public.password_reset", stage="confirm"))
        api.post(
            "/api/v1/auth/password-reset",
            json={
                "code": (request.form.get("code") or "").strip(),
                "new_password": request.form.get("new_password", ""),
            },
            auth=False,
        )
    except api.ApiError as exc:
        flash(exc.user_message(), "error")
        return render_template("password_reset.html", stage=stage), exc.status
    flash("Your password has been changed. Please sign in.", "success")
    return redirect(url_for("public.login"))


# --- catalogue ------------------------------------------------------------
@bp.get("/services")
def services() -> str:
    """The public service catalogue. Works signed out.

    `q`, `category` and `delivery` narrow the list. The first two were already
    links in the design — the landing page deep-links into a category and the
    header carries a search box — but nothing read them, so every filter
    silently showed everything. Filtering happens here rather than in the
    template so the empty state describes what was actually asked for.

    `category` accepts either the category code or its name, because the
    landing page links by code and the catalogue's own select does too, while
    hand-written links in the ported mockups use readable names.
    """
    query = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    delivery = (request.args.get("delivery") or "").strip()

    services = api.items_of(api.try_get("/api/v1/catalog/services"))
    categories = api.items_of(api.try_get("/api/v1/catalog/categories"))

    def matches(service: dict[str, Any]) -> bool:
        if delivery in ("digital", "office"):
            if bool(service.get("is_digital")) != (delivery == "digital"):
                return False
        if category:
            haystack = {
                str(service.get("category_id", "")),
                str(service.get("category_code", "")).lower(),
                str(service.get("category_name", "")).lower(),
            }
            if category.lower() not in haystack:
                return False
        if query:
            text = " ".join(
                str(service.get(field, ""))
                for field in ("name", "description", "code")
            ).lower()
            if query.lower() not in text:
                return False
        return True

    return render_template(
        "citizen_portal.html",
        services=[s for s in services if matches(s)],
        categories=categories,
        offices=api.items_of(api.try_get("/api/v1/catalog/offices")),
        profile=auth.current_profile(),
        query=query,
        category=category,
        delivery=delivery,
    )


@bp.get("/track")
def track() -> Any:
    """Public tracking-code lookup — the one read that needs no session."""
    code = (request.args.get("code") or "").strip()
    result = None
    if code:
        try:
            result = api.get(f"/api/v1/requests/track/{code}", auth=False)
        except api.ApiError:
            # Same response whether the code is malformed or simply not yours:
            # a distinguishable answer makes this a tracking-code oracle, which
            # is the enumeration CrowdSec scenario watiq/tracking-enum watches.
            flash("No request matches that tracking code.", "error")
    return render_template("track.html", code=code, result=result)


# --- informational pages --------------------------------------------------
# contact and help are not here: they render the support-desk design instead
# of the generic content page.
_CONTENT = {
    "privacy": ("Privacy Policy", "privacy"),
    "terms": ("Terms of Service", "terms"),
    "accessibility": ("Accessibility Statement", "accessibility"),
    "about": ("About Watiq", "about"),
    "open-data": ("Open Data", "open-data"),
}


@bp.get("/legal/privacy")
def privacy() -> str:
    return _content("privacy")


@bp.get("/legal/terms")
def terms() -> str:
    return _content("terms")


@bp.get("/accessibility")
def accessibility() -> str:
    return _content("accessibility")


@bp.route("/contact", methods=["GET", "POST"])
def contact() -> Any:
    """Support desk.

    The design carries a full inquiry form, but the API has no ticket
    endpoint yet (nothing under /api/v1 accepts one). Rather than post into a
    void, the form submits here and says plainly that the online channel is
    not live, pointing at the phone and email the same page lists. Replace this
    branch with an api.post once the backend exposes inquiries.
    """
    if request.method == "POST":
        flash(
            "Online inquiries are not connected yet. Please use the telephone "
            "or email channel listed below and quote your national ID.",
            "info",
        )
        return redirect(url_for("public.contact"))
    return render_template("support.html", page_title="Contact Us", slug="contact")


@bp.get("/help")
def help_page() -> str:
    return render_template("support.html", page_title="Help & Support", slug="help")


@bp.get("/about")
def about() -> str:
    return _content("about")


@bp.get("/open-data")
def open_data() -> str:
    return _content("open-data")


def _content(key: str) -> str:
    title, slug = _CONTENT[key]
    return render_template("content_page.html", page_title=title, slug=slug)
