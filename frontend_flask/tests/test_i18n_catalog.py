"""Translatable strings are well-formed, in every template and every catalog.

The percent rule is the one that bites. Jinja's i18n extension %-formats the
result of every `_()` call — "Always treat as a format string, even if there
are no variables" — so a msgid containing a bare `%` raises ValueError the
moment its page renders. It is invisible until someone loads that one route:
`_('Current Progress: 68% - Security layers...')` sat in the maintenance
template and took /status to a 500 while every other page stayed green.

A translator can reintroduce it just as easily, in a language nobody on the
team reads, so the catalogs are checked on the same rule as the sources.
"""

from __future__ import annotations

import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]

# %(name)s is a real placeholder and %% is an escaped literal; both are fine.
PLACEHOLDER = re.compile(r"%(\([a-zA-Z_][a-zA-Z0-9_]*\)[sdif]|%)")
CALL = re.compile(r"_\(\s*'((?:[^'\\]|\\.)*)'|_\(\s*\"((?:[^\"\\]|\\.)*)\"")


def bare_percent(text: str) -> bool:
    return "%" in PLACEHOLDER.sub("", text)


def template_files() -> list[pathlib.Path]:
    return sorted((ROOT / "templates").rglob("*.html"))


@pytest.mark.parametrize("path", template_files(), ids=lambda p: p.name)
def test_template_msgids_escape_percent(path: pathlib.Path) -> None:
    offenders = [
        msgid
        for match in CALL.finditer(path.read_text(encoding="utf-8"))
        for msgid in [match.group(1) or match.group(2) or ""]
        if bare_percent(msgid)
    ]
    assert not offenders, (
        f"{path.name}: msgid contains an unescaped '%', which Jinja reads as a "
        f"conversion spec and raises on. Write '%%' for a literal percent: "
        f"{offenders}"
    )


def catalog_files() -> list[pathlib.Path]:
    return sorted((ROOT / "translations").rglob("*.po"))


@pytest.mark.skipif(not catalog_files(), reason="no catalogs compiled yet")
@pytest.mark.parametrize("path", catalog_files(), ids=lambda p: p.parent.parent.name)
def test_translations_keep_their_placeholders(path: pathlib.Path) -> None:
    """A translation must carry the same placeholders as its source.

    Dropping %(name)s loses the value; inventing one raises KeyError. Both are
    silent until that message is the one on screen.
    """
    text = path.read_text(encoding="utf-8")
    entries = re.findall(
        r'^msgid\s+"((?:[^"\\]|\\.)*)"\s*\nmsgstr\s+"((?:[^"\\]|\\.)*)"',
        text,
        re.M,
    )
    problems = []
    for msgid, msgstr in entries:
        if not msgstr:
            continue  # untranslated falls back to the source
        if bare_percent(msgstr):
            problems.append(f"unescaped '%' in translation of {msgid!r}")
            continue
        if set(PLACEHOLDER.findall(msgid)) != set(PLACEHOLDER.findall(msgstr)):
            problems.append(f"placeholder mismatch for {msgid!r} -> {msgstr!r}")
    assert not problems, f"{path.parent.parent.name}: {problems}"
