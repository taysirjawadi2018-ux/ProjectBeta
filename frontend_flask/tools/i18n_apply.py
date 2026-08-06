#!/usr/bin/env python3
"""Write authored translations into the fr/ and ar/ catalogs.

Translations live in tools/translations_data.py as {msgid: {"fr": ..., "ar": ...}}
so they are reviewable in one place and survive `pybabel update`, which would
otherwise be the only record of them.

Only empty msgstr entries are filled: anything a human has already edited in the
.po stays put.
"""
import pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from translations_data import TRANSLATIONS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


def po_escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace('"', '\\"')
                .replace("\n", "\\n").replace("\t", "\\t"))


def unescape(text: str) -> str:
    return (text.replace('\\"', '"').replace("\\n", "\n")
                .replace("\\t", "\t").replace("\\\\", "\\"))


ENTRY = re.compile(
    r'(msgid\s+((?:"(?:[^"\\]|\\.)*"\s*)+))(msgstr\s+((?:"(?:[^"\\]|\\.)*"\s*)+))',
    re.M,
)


def apply(lang: str) -> tuple[int, int]:
    path = ROOT / "translations" / lang / "LC_MESSAGES" / "messages.po"
    text = path.read_text(encoding="utf-8")
    filled = missing = 0

    def sub(m):
        nonlocal filled, missing
        msgid = unescape("".join(re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(2))))
        current = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(4)))
        if not msgid:
            return m.group(0)          # the catalog header
        if current:
            return m.group(0)          # already translated; never overwrite
        value = TRANSLATIONS.get(msgid, {}).get(lang)
        if not value:
            missing += 1
            return m.group(0)
        filled += 1
        return f'{m.group(1)}msgstr "{po_escape(value)}"\n'

    path.write_text(ENTRY.sub(sub, text), encoding="utf-8")
    return filled, missing


if __name__ == "__main__":
    for lang in ("fr", "ar"):
        filled, missing = apply(lang)
        print(f"  {lang}: {filled} filled, {missing} still empty")
