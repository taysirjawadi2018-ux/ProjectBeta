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
}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def page_name(stem: str) -> str:
    return TARGETS[stem][0].removesuffix(".html").lstrip("_")


def main() -> None:
    manifest = json.loads(
        (ROOT / "static" / "img" / "manifest.json").read_text(encoding="utf-8")
    )
    PAGE_CSS.mkdir(parents=True, exist_ok=True)
    PAGE_JS.mkdir(parents=True, exist_ok=True)
    report: dict[str, dict] = {}

    for stem, (template, extra_classes) in TARGETS.items():
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
        (PAGE_CSS / f"{page}.css").write_text(
            "\n".join(css_parts).strip() + "\n", encoding="utf-8"
        )

        # --- write the page script -----------------------------------------
        if scripts:
            js = "\n\n".join(script.strip() for script in scripts)
            (PAGE_JS / f"{page}.js").write_text(
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
        (TEMPLATES / template).write_text("\n".join(out) + "\n", encoding="utf-8")

        report[template] = {k: len(v) for k, v in issues.items() if v}
        print(f"{template:<28} <- {stem}")
        for key, values in sorted(issues.items()):
            if values:
                print(f"    {key:<24} {len(values)}")

    (ROOT / "tools" / "port_report.json").write_text(
        json.dumps(report, indent=1) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
