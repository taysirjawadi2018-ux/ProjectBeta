#!/usr/bin/env python3
"""First-pass port of frontend/*.html into Jinja templates.

This does the mechanical, error-prone 80% of the port -- the transforms that
are identical for all fifteen mockups and that the CSP test suite enforces:

  * lift <style> into static/css/pages/<page>.css
  * lift <script> and every inline on*= handler into static/js/pages/<page>.js
  * rewrite lh3.googleusercontent.com images to url_for('static', ...)
  * turn inline style="background-image: url(...)" into a generated class,
    since style-src blocks the attribute just as it blocks a <style> block
  * promote data-alt (an image-generation prompt) to a real alt
  * drop the Play CDN script, the inline tailwind.config and the Google Fonts
    links, all of which the compiled stylesheet replaces
  * wrap the body in `{% extends "base.html" %}`

What it deliberately does NOT do is invent routes or data. It leaves a report
of every href="#", every <button> without type/data-action, and every form
without an action so those get hand-wired to real endpoints afterwards.

Run once; the templates are hand-edited after this and are not regenerated.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MOCKUPS = ROOT.parent / "frontend"
TEMPLATES = ROOT / "templates"
PAGE_CSS = ROOT / "static" / "css" / "pages"
PAGE_JS = ROOT / "static" / "js" / "pages"

# mockup stem -> (template name, extra <html> classes)
TARGETS = {
    "national_portal": ("index.html", ""),
    "secure_login": ("login.html", ""),
    "citizen_registration": ("register.html", ""),
    "secure_account_recovery": ("password_reset.html", ""),
    "staff_MFA_verification": ("mfa.html", ""),
    "citizen_dashboard": ("citizen_dashboard.html", ""),
    "service_catalogue": ("citizen_portal.html", ""),
    "crimanel_record_B3_application": ("submit_request.html", "icons-w300"),
    "searchabale_appointment_map": ("book_appointment.html", ""),
    "secure_paiment_and_receipting": ("payment_confirmation.html", ""),
    "profile_management": ("profile.html", ""),
    "support_and_inquiries": ("support.html", ""),
    "auditor_security_dashboard": ("staff_audit.html", ""),
    "security_acces_blocked": ("_error_blocked.html", ""),
    "system_maintenance": ("_error_maintenance.html", "icons-w300"),
    # --- second drop -------------------------------------------------------
    # Twelve more mockups arrived after the first port. Four of them describe
    # screens the app had no route for at all; those routes were added with
    # them. `document_verification_and_details` moved off request_detail when
    # `application_detail` turned up, because that one is the native design
    # for a service request while the former is a *document* view.
    "select_appointment_slot": ("book_appointment.html", ""),
    "application_detail": ("request_detail.html", ""),
    "payment_success_receipt": ("payment_confirmation.html", ""),
    "user_activity_audit": ("staff_audit.html", ""),
    "terms_and_conditions": ("content_page.html", ""),
    "frequently_asked_questions": ("faq.html", ""),
    "live_support_chat": ("support_chat.html", ""),
    "document_upload": ("document_upload.html", ""),
    "my_document_list": ("my_documents.html", ""),
    "document_verification_and_details": ("document_detail.html", ""),
    "security_log": ("security_log.html", ""),
    "appointment_detail": ("appointment_detail.html", ""),
    "system_integrity_and_health": ("staff_health.html", ""),
}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def page_name(stem: str) -> str:
    return TARGETS[stem][0].removesuffix(".html").lstrip("_")


def main() -> None:
    # Every template here has been hand-finished since its first pass, so a
    # bare re-run would throw that away. Naming the mockups to port is now
    # required, and a second drop stages into templates/_staged/ rather than
    # overwriting a template that already exists:
    #
    #   python tools/port_mockups.py --only application_detail security_log
    #
    # Pass --overwrite only for a mockup whose template has never been touched.
    argv = sys.argv[1:]
    overwrite = "--overwrite" in argv
    argv = [a for a in argv if a != "--overwrite"]
    if not argv or argv[0] != "--only" or len(argv) < 2:
        sys.exit(
            "usage: port_mockups.py --only <mockup-stem> [...] [--overwrite]\n"
            f"known stems: {', '.join(sorted(TARGETS))}"
        )
    wanted = argv[1:]
    if unknown := [stem for stem in wanted if stem not in TARGETS]:
        sys.exit(f"not in TARGETS: {', '.join(unknown)}")

    manifest = json.loads(
        (ROOT / "static" / "img" / "manifest.json").read_text(encoding="utf-8")
    )
    PAGE_CSS.mkdir(parents=True, exist_ok=True)
    PAGE_JS.mkdir(parents=True, exist_ok=True)
    staged = TEMPLATES / "_staged"
    report: dict[str, dict] = {}

    for stem in wanted:
        template, extra_classes = TARGETS[stem]
        source = MOCKUPS / f"{stem}.html"
        html = source.read_text(encoding="utf-8")
        page = page_name(stem)
        issues: dict[str, list[str]] = {}

        title_match = re.search(r"<title>(.*?)</title>", html, re.S)
        title = (title_match.group(1) if title_match else "Watiq").strip()

        style_blocks = re.findall(r"<style>(.*?)</style>", html, re.S)
        scripts = re.findall(
            r'<script(?![^>]*\bid="tailwind-config")(?![^>]*\bsrc=)[^>]*>(.*?)</script>',
            html,
            re.S,
        )

        body_match = re.search(r"<body([^>]*)>(.*)</body>", html, re.S)
        if not body_match:
            sys.exit(f"{stem}: no <body>")
        body_attrs, body = body_match.group(1), body_match.group(2)
        body_class = ""
        class_match = re.search(r'class="([^"]*)"', body_attrs)
        if class_match:
            body_class = class_match.group(1)

        body = re.sub(r"<style>.*?</style>", "", body, flags=re.S)
        body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.S)

        extra_css: list[str] = []

        def static_url(filename: str) -> str:
            return "{{ url_for('static', filename='" + filename + "') }}"

        # 1. <img src="https://lh3...">
        def swap_img(match: re.Match) -> str:
            url = match.group(1)
            if url not in manifest:
                issues.setdefault("unmapped_image", []).append(url[:60])
                return match.group(0)
            return f'src="{static_url("img/" + manifest[url])}"'

        body = re.sub(r'src="(https://lh3\.googleusercontent\.com/[^"]+)"', swap_img, body)

        # 2. inline style="background-image: url(...)" -> generated class
        counter = [0]

        def swap_inline_bg(match: re.Match) -> str:
            attr = match.group(0)
            url_match = re.search(
                r'url\(\s*[\'"]?(https://lh3\.googleusercontent\.com/[^\'")]+)', attr
            )
            if not url_match or url_match.group(1) not in manifest:
                issues.setdefault("inline_style", []).append(attr[:70])
                return attr
            counter[0] += 1
            cls = f"bg-asset-{slugify(page)}-{counter[0]}"
            rest = re.sub(
                r"background-image\s*:\s*url\([^)]*\)\s*;?", "", match.group(1)
            ).strip()
            extra_css.append(
                f".{cls} {{\n"
                f"  background-image: url('../../img/{manifest[url_match.group(1)]}');\n"
                f"}}"
            )
            if rest:
                issues.setdefault("inline_style_leftover", []).append(rest[:70])
            return f'data-bgclass="{cls}"'

        body = re.sub(r'style="([^"]*background-image[^"]*)"', swap_inline_bg, body)

        # 3. remaining inline styles have to be hand-moved into the page sheet
        for leftover in re.findall(r'\sstyle="[^"]*"', body):
            issues.setdefault("inline_style", []).append(leftover.strip()[:70])

        # 4. data-alt (a generation prompt) -> a real alt, first sentence only
        def swap_alt(match: re.Match) -> str:
            text = re.split(r"(?<=[.?!])\s", match.group(1).strip())[0]
            text = text[:120].rstrip(" ,;").replace('"', "'")
            return f'alt="{text}"'

        body = re.sub(r'data-alt="([^"]*)"', swap_alt, body)

        # 5. inline event handlers -> data-action, wired up in the page script
        for handler in re.findall(r'\son[a-z]+="[^"]*"', body):
            issues.setdefault("inline_handler", []).append(handler.strip()[:70])

        # 6. controls that need a real destination
        issues.setdefault("dead_href", []).extend(re.findall(r'href="#"', body))
        for button in re.findall(r"<button[^>]*>", body):
            if 'type="submit"' not in button and "data-action" not in button:
                issues["dead_button"] = issues.get("dead_button", []) + [button[:70]]
        for form in re.findall(r"<form[^>]*>", body):
            if "action=" not in form:
                issues.setdefault("form_without_action", []).append(form[:70])

        # --- write the page stylesheet -------------------------------------
        css = "\n".join(block.strip() for block in style_blocks)
        for url, filename in manifest.items():
            css = css.replace(url, f"../../img/{filename}")
        css_parts = [
            f"/* {template} — rules lifted from frontend/{stem}.html.",
            " * Kept out of the shared sheet because several mockups define the same",
            " * class with different values. Loaded from the page's page_style block.",
            " */",
            css.strip(),
        ]
        if extra_css:
            css_parts += [
                "",
                "/* Backgrounds the mockup set with an inline style attribute, which",
                " * style-src blocks. The element carries data-bgclass and the class is",
                " * applied from the page script. */",
                "\n".join(extra_css),
            ]
        css_target = PAGE_CSS / f"{page}.css"
        if css_target.exists() and not overwrite:
            css_target = PAGE_CSS / f"{page}.staged.css"
        css_target.write_text(
            "\n".join(css_parts).strip() + "\n", encoding="utf-8"
        )

        # --- write the page script -----------------------------------------
        if scripts:
            js = "\n\n".join(script.strip() for script in scripts)
            js_target = PAGE_JS / f"{page}.js"
            if js_target.exists() and not overwrite:
                js_target = PAGE_JS / f"{page}.staged.js"
            js_target.write_text(
                f"/* {template} — behaviour lifted from frontend/{stem}.html.\n"
                " * Inline <script> is blocked by script-src 'self', so it lives here\n"
                " * and is loaded with defer from the page's scripts block.\n"
                " */\n" + js + "\n",
                encoding="utf-8",
            )

        # --- write the template --------------------------------------------
        html_classes = " ".join(
            filter(None, ["light", f"tk-{slugify(stem)}", extra_classes])
        )
        out = [
            "{% extends 'base.html' %}",
            f"{{% set html_class = '{html_classes}' %}}",
            f"{{% block title %}}{title}{{% endblock %}}",
            f"{{% block body_class %}}{body_class}{{% endblock %}}",
            "{% block page_style %}",
            f'<link href="{static_url("css/pages/" + page + ".css")}" rel="stylesheet"/>',
            "{% endblock %}",
            "{% block content %}",
            body.strip(),
            "{% endblock %}",
        ]
        if scripts:
            out += [
                "{% block scripts %}",
                f'<script src="{static_url("js/pages/" + page + ".js")}" defer></script>',
                "{% endblock %}",
            ]
        target = TEMPLATES / template
        if target.exists() and not overwrite:
            staged.mkdir(parents=True, exist_ok=True)
            target = staged / template
        target.write_text("\n".join(out) + "\n", encoding="utf-8")

        report[template] = {k: len(v) for k, v in issues.items() if v}
        print(f"{target.relative_to(ROOT)!s:<44} <- {stem}")
        for key, values in sorted(issues.items()):
            if values:
                print(f"    {key:<24} {len(values)}")

    (ROOT / "tools" / "port_report.json").write_text(
        json.dumps(report, indent=1) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
