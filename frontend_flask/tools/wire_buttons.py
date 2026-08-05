#!/usr/bin/env python3
"""Give every <button> left by the port a real job.

The mockups used <button> for three different things and wired none of them:
navigation, form submission, and in-page widget controls. Each is fixed
differently:

  nav    -> becomes an <a href>, because navigating is what a link is for and
            a button that navigates is invisible to keyboard/AT users
  submit -> gains type="submit" so it posts the form it sits in
  action -> gains data-action, dispatched by static/js/watiq.js

Sign-out anchors also become CSRF-protected POST forms here: the app already
exposes public.logout as POST-only, so a plain link could never have worked.
"""

from __future__ import annotations

import pathlib
import re

TEMPLATES = pathlib.Path("templates")

NAV = "nav"
SUBMIT = "submit"
ACTION = "action"

# label -> (kind, target). Labels are the button's visible text with any icon
# ligature included, matched on a normalised prefix.
BUTTONS: dict[str, tuple[str, str]] = {
    # --- navigation ---
    "notifications": (NAV, "citizen.notifications"),
    "settings": (NAV, "citizen.profile"),
    "account_balance": (NAV, "public.index"),
    "emergency Emergency Support": (NAV, "public.contact"),
    "support_agent Contact Support": (NAV, "public.contact"),
    "Contacter le support": (NAV, "public.contact"),
    "send Lodge Official Appeal": (NAV, "public.contact"),
    "Lodge Official Inquiry open_in_new": (NAV, "public.contact"),
    "add New Request": (NAV, "citizen.submit_request"),
    "Initialize Application arrow_forward": (NAV, "citizen.submit_request"),
    "Request Digital Copy": (NAV, "citizen.submit_request"),
    "View Full History": (NAV, "citizen.requests_list"),
    "arrow_back Retour": (NAV, "citizen.requests_list"),
    "View Full Access Log": (NAV, "staff.audit"),
    "View All Anomalous Activities": (NAV, "staff.audit"),
    "Pay Fees": (NAV, "citizen.payments"),
    "View QR Ticket qr_code_2": (NAV, "citizen.appointments"),
    "Staff Access": (NAV, "public.login"),
    # --- form submission ---
    "Lodge Formal Inquiry send": (SUBMIT, ""),
    "Authorize Transaction": (SUBMIT, ""),
    "Complete Recovery Process": (SUBMIT, ""),
    "save Save Changes": (SUBMIT, ""),
    "Update Request": (SUBMIT, ""),
    "Étape Suivante arrow_forward": (SUBMIT, ""),
    "Book Now arrow_forward": (SUBMIT, ""),
    # --- accessibility / interpreter widget ---
    "close": (ACTION, "a11y-close"),
    "play_arrow": (ACTION, "a11y-play"),
    "pause": (ACTION, "a11y-pause"),
    "volume_off": (ACTION, "a11y-unmute"),
    "volume_up": (ACTION, "a11y-mute"),
    "fullscreen": (ACTION, "a11y-expand"),
    "open_in_full AGRANDIR": (ACTION, "a11y-expand"),
    "open_in_full": (ACTION, "a11y-expand"),
    "Launch Live Interpreter": (ACTION, "a11y-interpreter"),
    # --- in-page widgets ---
    "search": (ACTION, "search-focus"),
    "edit": (ACTION, "edit-field"),
    "visibility": (ACTION, "reveal-pin"),
    "chevron_left": (ACTION, "calendar-prev"),
    "chevron_right": (ACTION, "calendar-next"),
    "filter_list Advanced Filters": (ACTION, "toggle"),
    "filter_list Institutional Filters": (ACTION, "toggle"),
    "print Export Data": (ACTION, "print"),
    "download_for_offline": (ACTION, "print"),
    "Resend Code": (ACTION, "resend-code"),
    "key Use Recovery Code": (ACTION, "recovery-code"),
    "fingerprint Use Biometrics": (ACTION, "use-biometrics"),
    "key Recovery Key": (ACTION, "use-recovery-key"),
    "Revoke All Access": (ACTION, "revoke-sessions"),
    "10:00 AM": (ACTION, "select-time"),
    # --- second mockup drop ------------------------------------------------
    # Anything data-driven is deliberately absent: the calendar day numbers,
    # the time slots and the pagination digits become Jinja loops over real
    # rows during the merge, so wiring them from a label here would only have
    # to be undone.
    "account_circle": (NAV, "citizen.profile"),
    "menu": (ACTION, "toggle"),
    "minimize": (ACTION, "toggle"),
    "sign_language": (ACTION, "a11y-interpreter"),
    "more_vert": (ACTION, "toggle"),
    "attach_file": (ACTION, "attach-file"),
    "Send send": (SUBMIT, ""),
    "Decline": (NAV, "public.index"),
    "Accept &amp; Continue": (SUBMIT, ""),
    "Return to Dashboard": (NAV, "citizen.dashboard"),
    "View All History": (NAV, "citizen.security_log"),
    "Enable 2FA Now": (NAV, "citizen.profile"),
    "Terminate Session": (SUBMIT, ""),
    "New Request": (NAV, "citizen.submit_request"),
    "download Export": (ACTION, "print"),
    "download Export CSV": (ACTION, "print"),
    "picture_as_pdf Export PDF": (ACTION, "print"),
    "download Download PDF Receipt": (ACTION, "print"),
    "download Download Receipt": (ACTION, "print"),
}

# Buttons whose action needs an argument the label alone does not carry.
EXTRA_ATTRS = {
    "select-time": 'data-time="10:00"',
    "toggle": 'data-target="advanced-filters"',
    "reveal-pin": 'data-target="pin-value"',
}


def label_of(inner: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", inner).split())


def match_label(label: str) -> tuple[str, str] | None:
    for key in sorted(BUTTONS, key=len, reverse=True):
        if label == key or label.startswith(key):
            return BUTTONS[key]
    return None


def main() -> None:
    counts = {NAV: 0, SUBMIT: 0, ACTION: 0}
    unmatched: list[tuple[str, str]] = []

    # _staged/ holds a second-drop port waiting to be merged into an existing
    # template; wiring it here means the merge is a content decision only.
    paths = sorted(TEMPLATES.glob("*.html")) + sorted(
        (TEMPLATES / "_staged").glob("*.html")
    )
    for path in paths:
        html = path.read_text(encoding="utf-8")

        # --- sign-out links become POST forms -----------------------------
        def logout(match: re.Match) -> str:
            tag, inner = match.group(1), match.group(2)
            classes = re.search(r'class="([^"]*)"', tag)
            aria = 'aria-label="Sign out"'
            return (
                '<form action="{{ url_for(\'public.logout\') }}" class="contents" method="post">'
                '<input name="csrf_token" type="hidden" value="{{ csrf_token() }}"/>'
                f'<button {aria} class="{classes.group(1) if classes else ""}" type="submit">'
                f"{inner}</button></form>"
            )

        html = re.sub(
            r'(<a[^>]*href="#"[^>]*>)((?:(?!</a>).)*?logout(?:(?!</a>).)*?)</a>',
            logout,
            html,
            flags=re.S,
        )

        # --- buttons ------------------------------------------------------
        def wire(match: re.Match) -> str:
            tag, inner = match.group(1), match.group(2)
            if 'type="submit"' in tag or "data-action" in tag:
                return match.group(0)
            label = label_of(inner)
            hit = match_label(label)
            if hit is None:
                unmatched.append((path.name, label[:40]))
                return match.group(0)
            kind, target = hit
            counts[kind] += 1
            if kind == NAV:
                attrs = re.sub(r"^<button", "", tag)[:-1].strip()
                attrs = re.sub(r'\stype="[a-z]+"', "", attrs)
                href = "{{ url_for('" + target + "') }}"
                return f'<a href="{href}" {attrs}>{inner}</a>'
            if kind == SUBMIT:
                return f'{tag[:-1]} type="submit">{inner}</button>'
            extra = EXTRA_ATTRS.get(target, "")
            return (
                f'{tag[:-1]} data-action="{target}" {extra} type="button">{inner}</button>'
            )

        new = re.sub(r"(<button[^>]*>)(.*?)</button>", wire, html, flags=re.S)
        if new != html:
            path.write_text(new, encoding="utf-8")

    print(
        f"nav->link {counts[NAV]}, submit {counts[SUBMIT]}, data-action {counts[ACTION]}"
    )
    for page, label in unmatched:
        print(f"  unmatched  {page:<26} {label}")


if __name__ == "__main__":
    main()
