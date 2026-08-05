#!/usr/bin/env python3
"""Point every href="#" left by the port at the endpoint its label implies.

The mockups were static, so every link was a placeholder. The labels are
consistent across the fifteen screens, so the destination is derivable from the
link text rather than needing fifteen separate judgement calls.

Sign-out is deliberately not handled here: logging out is a state change and
must be a CSRF-protected POST, so those links are converted to forms by hand.
"""
import pathlib, re, sys

SERVICE = "{{ url_for('public.services') }}"
M = {
    "Dashboard": "{{ url_for('citizen.dashboard') }}",
    "Home": "{{ url_for('public.index') }}",
    "E-Government": "{{ url_for('public.index') }}",
    "Institutional Portal": "{{ url_for('public.index') }}",
    "Applications": "{{ url_for('citizen.requests_list') }}",
    "My Documents": "{{ url_for('citizen.requests_list') }}",
    "Docs": "{{ url_for('citizen.requests_list') }}",
    "Legal Vault": "{{ url_for('citizen.requests_list') }}",
    "View Digital Vault": "{{ url_for('citizen.requests_list') }}",
    "National Archive": "{{ url_for('citizen.requests_list') }}",
    "Appointments": "{{ url_for('citizen.appointments') }}",
    "Settings": "{{ url_for('citizen.profile') }}",
    "Profile": "{{ url_for('citizen.profile') }}",
    "National Services": SERVICE,
    "E-Services": SERVICE,
    "Services": SERVICE,
    "Security Log": "{{ url_for('staff.audit') }}",
    "Auditor Dashboard": "{{ url_for('staff.audit') }}",
    "Help Center": "{{ url_for('public.help_page') }}",
    "User Manuals": "{{ url_for('public.help_page') }}",
    "Technical Manuals": "{{ url_for('public.help_page') }}",
    "Legal Support": "{{ url_for('public.contact') }}",
    "Support": "{{ url_for('public.contact') }}",
    "Support Center": "{{ url_for('public.contact') }}",
    "Contact Support": "{{ url_for('public.contact') }}",
    "Contact Official": "{{ url_for('public.contact') }}",
    "IT Support": "{{ url_for('public.contact') }}",
    "Institutional Support": "{{ url_for('public.contact') }}",
    "Priority Support": "{{ url_for('public.contact') }}",
    "Security Protocols": "{{ url_for('public.terms') }}",
    "Security Protocol": "{{ url_for('public.terms') }}",
    "Cryptographic Standards": "{{ url_for('public.terms') }}",
    "Cybersecurity Ops": "{{ url_for('public.terms') }}",
    "Audit Requirements": "{{ url_for('public.terms') }}",
    "Data Locality Policy": "{{ url_for('public.terms') }}",
    "Legal Notice": "{{ url_for('public.terms') }}",
    "Legal Policy": "{{ url_for('public.terms') }}",
    "Terms of Service": "{{ url_for('public.terms') }}",
    "Terms of Use": "{{ url_for('public.terms') }}",
    "Privacy Policy": "{{ url_for('public.privacy') }}",
    "Privacy Governance": "{{ url_for('public.privacy') }}",
    "Privacy Hub": "{{ url_for('public.privacy') }}",
    "Security": "{{ url_for('public.privacy') }}",
    "Accessibility": "{{ url_for('public.accessibility') }}",
    "Accessibility Standards": "{{ url_for('public.accessibility') }}",
    "Accessibility Statement": "{{ url_for('public.accessibility') }}",
    "Transparency": "{{ url_for('public.open_data') }}",
    "Official Gazettes": "{{ url_for('public.open_data') }}",
    "Developer API": "{{ url_for('public.open_data') }}",
    "API Documentation": "{{ url_for('public.open_data') }}",
    "System Status": "{{ url_for('public.about') }}",
    "Status Dashboard": "{{ url_for('public.about') }}",
    "RECOVER ACCESS": "{{ url_for('public.password_reset') }}",
    "Register Digital Identity": "{{ url_for('public.register') }}",
    "Civil Status": "{{ url_for('public.services', category='civil') }}",
    "Identity": "{{ url_for('public.services', category='identity') }}",
    "Justice": "{{ url_for('public.services', category='justice') }}",
    "E-Justice": "{{ url_for('public.services', category='justice') }}",
    "Admin": "{{ url_for('public.services', category='admin') }}",
    # --- second mockup drop ------------------------------------------------
    # These labels only appear on the twelve screens that arrived later, and
    # several of them finally have a real destination: "My Documents" used to
    # fall through to the request list because no document route existed.
    "Knowledge Base": "{{ url_for('public.help_page') }}",
    "FAQ": "{{ url_for('public.help_page') }}",
    "Frequently Asked Questions": "{{ url_for('public.help_page') }}",
    "Live Chat": "{{ url_for('public.support_chat') }}",
    "Start Chat": "{{ url_for('public.support_chat') }}",
    "Chat with an agent": "{{ url_for('public.support_chat') }}",
    "System Health": "{{ url_for('staff.health') }}",
    "Diagnostics": "{{ url_for('staff.health') }}",
    "Integrity Monitor": "{{ url_for('staff.health') }}",
    "Audit Logs": "{{ url_for('staff.audit') }}",
    "Verification Portal": "{{ url_for('public.track') }}",
    "Track Request": "{{ url_for('public.track') }}",
    "Payments": "{{ url_for('citizen.payments') }}",
    "Payment History": "{{ url_for('citizen.payments') }}",
    "Notifications": "{{ url_for('citizen.notifications') }}",
}

# Labels whose destination depends on who is looking. "My Documents" and
# "Security Log" both exist twice — a citizen-facing one and a staff-facing
# one — so they are resolved per template rather than globally.
BY_TEMPLATE = {
    "My Documents": {
        None: "{{ url_for('citizen.documents') }}",
        "staff_audit.html": "{{ url_for('staff.workbench') }}",
        "staff_health.html": "{{ url_for('staff.workbench') }}",
        "verify_request.html": "{{ url_for('staff.workbench') }}",
    },
    "Security Log": {
        None: "{{ url_for('citizen.security_log') }}",
        "staff_audit.html": "{{ url_for('staff.audit') }}",
        "staff_health.html": "{{ url_for('staff.audit') }}",
        "verify_request.html": "{{ url_for('staff.audit') }}",
        "staff_workbench.html": "{{ url_for('staff.audit') }}",
    },
}
# Ligature text of a leading icon <span>, which is not part of the label.
ICONS = re.compile(r"^(dashboard|description|folder_shared|gavel|security|settings|"
                   r"help|calendar_month|apps|analytics|support_agent|logout)\s+")

def label_of(inner: str) -> str:
    text = " ".join(re.sub(r"<[^>]+>", " ", inner).split())
    return ICONS.sub("", text).strip()

changed = total = skipped = 0
# _staged/ holds a second-drop port waiting to be merged into a template that
# already exists; wiring it here saves doing the same links twice by hand.
paths = sorted(pathlib.Path("templates").glob("*.html")) + sorted(
    pathlib.Path("templates/_staged").glob("*.html")
)
for path in paths:
    html = path.read_text(encoding="utf-8")
    def wire(match):
        global changed, skipped
        tag, inner = match.group(1), match.group(2)
        label = label_of(inner)
        for key, choices in BY_TEMPLATE.items():
            if label == key:
                changed += 1
                url = choices.get(path.name, choices[None])
                return match.group(0).replace('href="#"', f'href="{url}"', 1)
        for key, url in M.items():
            if label == key or label.endswith(" " + key) or label.startswith(key):
                changed += 1
                return match.group(0).replace('href="#"', f'href="{url}"', 1)
        skipped += 1
        return match.group(0)
    new = re.sub(r'(<a[^>]*href="#"[^>]*>)(.*?)</a>', wire, html, flags=re.S)
    if new != html:
        path.write_text(new, encoding="utf-8")
print(f"wired {changed} links, {skipped} left for hand-wiring")
