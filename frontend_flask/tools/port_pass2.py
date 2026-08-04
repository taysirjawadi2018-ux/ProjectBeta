#!/usr/bin/env python3
"""Second port pass: clear the remaining inline style and on*= attributes.

Everything here is a bulk pattern rather than a per-page decision:

  * style="font-variation-settings: 'FILL' 1"  -> the existing .icon-filled class
  * style="width: 85%"                         -> Tailwind's w-[85%]
  * style="animation-delay: .2s"               -> a page-stylesheet class
  * the one radial-gradient background         -> a page-stylesheet class
  * onclick/onmouseover/onmouseout             -> data-action + data-* arguments,
    bound by delegation in the page script

Run after tools/port_mockups.py.
"""

from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
PAGE_CSS = ROOT / "static" / "css" / "pages"

PAGES = [
    "index.html",
    "login.html",
    "register.html",
    "password_reset.html",
    "mfa.html",
    "citizen_dashboard.html",
    "citizen_portal.html",
    "submit_request.html",
    "book_appointment.html",
    "payment_confirmation.html",
    "profile.html",
    "support.html",
    "staff_audit.html",
    "_error_blocked.html",
    "_error_maintenance.html",
]

# onclick source -> (data-action value, extra attributes)
HANDLERS = {
    "nextStep()": ("step-next", ""),
    "prevStep()": ("step-prev", ""),
    "nextStep(1)": ("step-next", 'data-step="1"'),
    "nextStep(2)": ("step-next", 'data-step="2"'),
    "nextStep(3)": ("step-next", 'data-step="3"'),
    "goToStep(1)": ("step-goto", 'data-step="1"'),
    "goToStep(2)": ("step-goto", 'data-step="2"'),
    "goToStep(3)": ("step-goto", 'data-step="3"'),
    "window.location.reload()": ("reload", ""),
    "toggleMobileMenu()": ("menu", ""),
    "goToStep2('Tunis Central')": ("select-office", 'data-office="Tunis Central"'),
    "goToStep2('Sfax North')": ("select-office", 'data-office="Sfax North"'),
    "goToStep2('Sousse Maritime')": ("select-office", 'data-office="Sousse Maritime"'),
    "selectTime('08:30')": ("select-time", 'data-time="08:30"'),
    "selectTime('09:15')": ("select-time", 'data-time="09:15"'),
    "selectTime('14:00')": ("select-time", 'data-time="14:00"'),
    "backToStep1()": ("booking-back", 'data-step="1"'),
    "backToStep2()": ("booking-back", 'data-step="2"'),
    "completeBooking()": ("booking-complete", ""),
}

DELAY_CSS = """
/* Staggered entrance delays the mockup set with an inline style attribute. */
.anim-delay-200 { animation-delay: 0.2s; }
.anim-delay-400 { animation-delay: 0.4s; }
"""

DOT_GRID_CSS = """
/* Dot grid the mockup set with an inline style attribute. */
.dot-grid {
  background-image: radial-gradient(rgb(var(--w-c-primary-fixed)) 1px, transparent 1px);
  background-size: 40px 40px;
}
"""


def add_class(tag: str, extra: str) -> str:
    """Append a class to a tag, creating the attribute when absent."""
    if re.search(r'\sclass="', tag):
        return re.sub(r'(\sclass=")', r"\1" + extra + " ", tag, count=1)
    return tag[:-1].rstrip() + f' class="{extra}">'


def main() -> None:
    for name in PAGES:
        path = TEMPLATES / name
        html = path.read_text(encoding="utf-8")
        css_additions: list[str] = []

        # --- FILL 1 icons -> .icon-filled --------------------------------
        def fill_icon(match: re.Match) -> str:
            tag = match.group(0)
            tag = re.sub(r"\sstyle=\"font-variation-settings: 'FILL' 1;?\"", "", tag)
            return add_class(tag, "icon-filled")

        html = re.sub(
            r"<[a-z]+[^>]*style=\"font-variation-settings: 'FILL' 1;?\"[^>]*>",
            fill_icon,
            html,
        )

        # --- width percentages -> Tailwind arbitrary values ---------------
        def width_pct(match: re.Match) -> str:
            tag, pct = match.group(0), match.group(1)
            tag = re.sub(r'\sstyle="width:\s*\d+%\s*"', "", tag)
            return add_class(tag, f"w-[{pct}%]")

        html = re.sub(r'<[a-z]+[^>]*style="width:\s*(\d+)%\s*"[^>]*>', width_pct, html)

        # --- animation delays --------------------------------------------
        def delay(match: re.Match) -> str:
            tag, seconds = match.group(0), match.group(1)
            tag = re.sub(r'\sstyle="animation-delay:\s*[\d.]+s\s*"', "", tag)
            return add_class(tag, f"anim-delay-{int(float(seconds) * 1000)}")

        if re.search(r'style="animation-delay', html):
            html = re.sub(
                r'<[a-z]+[^>]*style="animation-delay:\s*([\d.]+)s\s*"[^>]*>', delay, html
            )
            css_additions.append(DELAY_CSS)

        # --- the one radial-gradient dot grid -----------------------------
        def dot_grid(match: re.Match) -> str:
            tag = re.sub(r'\sstyle="background-image: radial-gradient[^"]*"', "", match.group(0))
            return add_class(tag, "dot-grid")

        if "radial-gradient" in html:
            html = re.sub(
                r'<[a-z]+[^>]*style="background-image: radial-gradient[^"]*"[^>]*>',
                dot_grid,
                html,
            )
            css_additions.append(DOT_GRID_CSS)

        # --- inline handlers -> data-action -------------------------------
        def handler(match: re.Match) -> str:
            event, body = match.group(1), match.group(2)
            if event == "click" and body in HANDLERS:
                action, extra = HANDLERS[body]
                return f' data-action="{action}"' + (f" {extra}" if extra else "")
            if event in ("mouseover", "mouseout"):
                target = re.search(r"getElementById\('([^']+)'\)", body)
                verb = "show" if "remove" in body else "hide"
                if target:
                    return f' data-hover-{verb}="{target.group(1)}"'
            return f' data-unported-{event}="{body}"'

        html = re.sub(r'\son([a-z]+)="([^"]*)"', handler, html)

        path.write_text(html, encoding="utf-8")

        if css_additions:
            css_path = PAGE_CSS / (name.removesuffix(".html").lstrip("_") + ".css")
            css_path.write_text(
                css_path.read_text(encoding="utf-8") + "\n".join(css_additions),
                encoding="utf-8",
            )

    # --- report -----------------------------------------------------------
    for name in PAGES:
        html = (TEMPLATES / name).read_text(encoding="utf-8")
        leftovers = re.findall(r'\sstyle="[^"]*"', html) + re.findall(
            r'\sdata-unported-[a-z]+="[^"]*"', html
        )
        if leftovers:
            print(f"{name}: {len(leftovers)} unhandled -> {leftovers[:3]}")
    print("pass 2 complete")


if __name__ == "__main__":
    main()
