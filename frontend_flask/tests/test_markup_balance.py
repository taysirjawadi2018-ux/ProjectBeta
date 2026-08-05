"""Every rendered page closes the tags it opens.

This is the failure mode the other suites cannot see. A template whose
`{% if %}` branches disagree about how many `</div>` they owe still returns
200, still carries no dead control and still passes every CSP check — it just
renders one branch with a stray or missing wrapper, and the layout collapses
only on that branch, for the data that reaches it.

Checking the *rendered* output rather than the template source is the point:
the imbalance usually lives in a branch, so it exists only once Jinja has
chosen one. Each route below is therefore parsed as the browser would get it.
"""

from __future__ import annotations

from html.parser import HTMLParser
from typing import Any

import pytest

from test_routes import CITIZEN_GETS, PUBLIC_GETS, STAFF_GETS

# Void elements never carry an end tag, so they never touch the stack.
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}


class TagStack(HTMLParser):
    """Push on every start tag, pop on the matching end tag."""

    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"</{tag}> with nothing open")
        elif self.stack[-1] != tag:
            self.errors.append(f"</{tag}> closes <{self.stack[-1]}>")
            # Resynchronise so one mistake does not cascade into noise.
            if tag in self.stack:
                while self.stack and self.stack.pop() != tag:
                    pass
        else:
            self.stack.pop()


def assert_balanced(body: str, path: str) -> None:
    parser = TagStack()
    parser.feed(body)
    assert not parser.errors, f"{path}: {parser.errors[:5]}"
    assert not parser.stack, f"{path}: never closed {parser.stack[:5]}"


@pytest.mark.parametrize("path", PUBLIC_GETS)
def test_public_pages_are_balanced(client: Any, path: str) -> None:
    assert_balanced(client.get(path).data.decode(), path)


@pytest.mark.parametrize("path", CITIZEN_GETS)
def test_citizen_pages_are_balanced(citizen: Any, path: str) -> None:
    assert_balanced(citizen.get(path).data.decode(), path)


@pytest.mark.parametrize("path", STAFF_GETS)
def test_staff_pages_are_balanced(admin: Any, path: str) -> None:
    assert_balanced(admin.get(path).data.decode(), path)
