#!/usr/bin/env python3
"""Repair end tags orphaned by turning a <button> into an <a> (or back).

wire_buttons.py rewrites the *opening* tag when a mockup used a <button> to
navigate, which leaves the matching </button> behind. Whitespace between the
label and the close varies from mockup to mockup, so patching it with string
replacement means one special case per occurrence. This walks the tag stack
instead and renames whichever end tag actually closes the element.

Only a/button are considered, and only where the pair genuinely disagrees —
anything else is left exactly as it is.

    python tools/fix_tag_pairs.py templates/foo.html [...]
"""

from __future__ import annotations

import pathlib
import re
import sys

PAIR = {"a", "button"}
TAG = re.compile(r"<(/?)(a|button)\b[^>]*?(/?)>", re.I)
VOID_SELF_CLOSING = "/"


def fix(text: str) -> tuple[str, int]:
    stack: list[tuple[str, int, int]] = []  # (tag, start, end) of the open tag
    edits: list[tuple[int, int, str]] = []

    for match in TAG.finditer(text):
        closing, tag, selfclose = match.group(1), match.group(2).lower(), match.group(3)
        if selfclose == VOID_SELF_CLOSING:
            continue
        if not closing:
            stack.append((tag, match.start(), match.end()))
            continue
        if not stack:
            continue
        opened, _, _ = stack.pop()
        if opened != tag and opened in PAIR and tag in PAIR:
            edits.append((match.start(), match.end(), f"</{opened}>"))

    for start, end, replacement in reversed(edits):
        text = text[:start] + replacement + text[end:]
    return text, len(edits)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for name in sys.argv[1:]:
        path = pathlib.Path(name)
        fixed, count = fix(path.read_text(encoding="utf-8"))
        if count:
            path.write_text(fixed, encoding="utf-8")
        print(f"{name}: {count} end tag{'' if count == 1 else 's'} repaired")


if __name__ == "__main__":
    main()
