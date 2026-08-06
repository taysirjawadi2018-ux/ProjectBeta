#!/usr/bin/env python3
"""List msgids still without a French translation, shortest first."""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
po = (ROOT / "translations/fr/LC_MESSAGES/messages.po").read_text(encoding="utf-8")
out = []
for m in re.finditer(r'msgid\s+((?:"(?:[^"\\]|\\.)*"\s*)+)msgstr\s+((?:"(?:[^"\\]|\\.)*"\s*)+)', po):
    msgid = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1)))
    msgstr = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(2)))
    if msgid and not msgstr:
        out.append(msgid)
start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end = int(sys.argv[2]) if len(sys.argv) > 2 else len(out)
print(f"# {len(out)} untranslated; showing {start}:{end}")
for s in sorted(out, key=len)[start:end]:
    print(s)
