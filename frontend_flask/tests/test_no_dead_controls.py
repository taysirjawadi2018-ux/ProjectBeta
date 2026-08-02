"""Regression gate: no dead links, no orphan buttons, no CSP violations.

These are the three ways the ported mockups quietly stopped being a working
application, so each one is asserted rather than eyeballed.
"""

from __future__ import annotations

import pathlib
import re
from typing import Any

import pytest

TEMPLATES = sorted(pathlib.Path(__file__).resolve().parents[1].joinpath("templates").rglob("*.html"))
assert TEMPLATES, "no templates found"


@pytest.mark.parametrize("path", TEMPLATES, ids=lambda p: p.stem)
def test_no_placeholder_links(path: pathlib.Path) -> None:
    hits = re.findall(r'href="#"', path.read_text())
    assert not hits, f'{path.name} still has {len(hits)} href="#"'


@pytest.mark.parametrize("path", TEMPLATES, ids=lambda p: p.stem)
def test_every_button_does_something(path: pathlib.Path) -> None:
    """A button either submits a form or carries a data-action hook."""
    orphans = [
        m.group(0)[:80]
        for m in re.finditer(r"<button\b([^>]*)>", path.read_text())
        if 'type="submit"' not in m.group(1) and "data-action" not in m.group(1)
    ]
    assert not orphans, f"{path.name}: buttons with no behaviour: {orphans}"


@pytest.mark.parametrize("path", TEMPLATES, ids=lambda p: p.stem)
def test_no_csp_violating_constructs(path: pathlib.Path) -> None:
    """The production CSP is default-src 'none' with script-src/style-src 'self'.

    Inline styles and scripts, and any remote asset host, are all rejected by
    it — so none may reappear in a template.
    """
    # Jinja comments never reach the browser, so they cannot violate anything —
    # and they are where these constructs get *described*.
    src = re.sub(r"\{#.*?#\}", "", path.read_text(), flags=re.S)
    assert "<style" not in src, f"{path.name}: inline <style> is blocked by style-src"
    assert not re.search(r"\sstyle=\"", src), f"{path.name}: inline style attribute is blocked"
    assert not re.search(r"\son[a-z]+=\"", src), f"{path.name}: inline event handler is blocked"
    for host in ("cdn.tailwindcss.com", "fonts.googleapis.com",
                 "fonts.gstatic.com", "lh3.googleusercontent.com"):
        assert host not in src, f"{path.name}: remote asset {host} is blocked by CSP"
    inline_scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)
    assert not [b for b in inline_scripts if b.strip()], (
        f"{path.name}: inline <script> is blocked by script-src 'self'"
    )


def test_rendered_pages_carry_no_remote_assets(client: Any, citizen: Any) -> None:
    """Belt and braces: check the rendered output, not just the sources."""
    pages = ["/", "/login", "/services", "/register", "/track", "/about"]
    body = "".join(client.get(p).data.decode() for p in pages)
    body += "".join(citizen.get(p).data.decode() for p in ("/dashboard", "/requests"))
    for host in ("cdn.tailwindcss.com", "fonts.googleapis.com",
                 "fonts.gstatic.com", "lh3.googleusercontent.com"):
        assert host not in body, f"rendered output still references {host}"
    assert 'style="' not in body


def test_every_url_for_target_exists(app: Any) -> None:
    """A url_for() naming a route that does not exist raises at render time.

    Rendering every page catches most of it, but branches behind {% if %} are
    only reached with the right data — so the endpoint names are also checked
    statically here.
    """
    known = {r.endpoint for r in app.url_map.iter_rules()}
    missing = []
    for path in TEMPLATES:
        for endpoint in re.findall(r"url_for\(\s*'([a-z_.]+)'", path.read_text()):
            if endpoint not in known:
                missing.append(f"{path.name}: {endpoint}")
    assert not missing, f"url_for targets that do not exist: {missing}"
