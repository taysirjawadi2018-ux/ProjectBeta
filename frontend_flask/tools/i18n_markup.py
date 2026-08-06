#!/usr/bin/env python3
"""Wrap translatable text in templates/ with {{ _('...') }}.

Run once to mark the templates up; it is idempotent, so re-running after new
markup is added only touches what is still bare.

Written as a state machine rather than a regex sweep because the templates mix
four languages in one file. The things it must NOT translate are as important
as the things it must:

  * Material Symbols ligatures. <span class="material-symbols-outlined">
    dashboard</span> renders an icon, and "tableau de bord" renders the word.
  * Anything inside <script>, <style> or <svg>.
  * Jinja itself -- {{ expr }}, {% stmt %}, {# comment #}.
  * Text with no letters: numbers, punctuation, "©", "—".

Where a run of text is interrupted by Jinja ("Welcome back{% if x %}, Mr...."),
each literal segment is wrapped on its own rather than the whole run, so the
msgid never contains template syntax.
"""
import pathlib, re, sys, collections

ATTRS = ("alt", "title", "placeholder", "aria-label")
SKIP_ELEMENTS = ("script", "style", "svg")
HAS_LETTER = re.compile(r"[A-Za-zÀ-ÿ]{2}")
ALREADY = re.compile(r"\{\{\s*_\(")

stats = collections.Counter()


def quote(text):
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def wrap_text(raw):
    """Wrap the literal parts of a text run, leaving Jinja and spacing intact."""
    out, changed = [], False
    for piece in re.split(r"(\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\})", raw, flags=re.S):
        if not piece or piece.startswith(("{{", "{%", "{#")):
            out.append(piece)
            continue
        lead = piece[: len(piece) - len(piece.lstrip())]
        tail = piece[len(piece.rstrip()) :]
        core = piece.strip()
        if not core or not HAS_LETTER.search(core):
            out.append(piece)
            continue
        out.append(f"{lead}{{{{ _({quote(core)}) }}}}{tail}")
        changed = True
        stats["text"] += 1
    return "".join(out), changed


def wrap_attributes(tag):
    """Translate the human-readable attributes on one tag."""
    def sub(m):
        name, value = m.group(1), m.group(2)
        if not value.strip() or not HAS_LETTER.search(value):
            return m.group(0)
        if "{{" in value or "{%" in value:
            return m.group(0)          # already dynamic; leave for a human
        stats["attr"] += 1
        return f'{name}="{{{{ _({quote(value.strip())}) }}}}"'

    return re.sub(rf'\b({"|".join(ATTRS)})="([^"]*)"', sub, tag)


def transform(src):
    out = []
    i, n = 0, len(src)
    skip_depth = 0          # inside script/style/svg
    pending_icon = False    # previous tag was a Material Symbols element
    while i < n:
        # --- Jinja passes through untouched -------------------------------
        for opener, closer in (("{#", "#}"), ("{%", "%}"), ("{{", "}}")):
            if src.startswith(opener, i):
                end = src.find(closer, i)
                end = n if end == -1 else end + len(closer)
                out.append(src[i:end])
                i = end
                break
        else:
            if src[i] == "<":
                end = i + 1
                while end < n:
                    if src.startswith("{{", end):
                        end = src.find("}}", end)
                        end = n if end == -1 else end + 2
                        continue
                    if src.startswith("{%", end):
                        end = src.find("%}", end)
                        end = n if end == -1 else end + 2
                        continue
                    if src[end] == ">":
                        break
                    end += 1
                tag = src[i : end + 1]
                name = re.match(r"</?\s*([a-zA-Z0-9-]+)", tag)
                name = name.group(1).lower() if name else ""
                if name in SKIP_ELEMENTS:
                    skip_depth += 0 if tag.startswith("</") else 1
                    if tag.startswith("</"):
                        skip_depth = max(0, skip_depth - 1)
                elif not tag.startswith("</") and skip_depth == 0:
                    tag = wrap_attributes(tag)
                pending_icon = "material-symbols-outlined" in tag and not tag.startswith("</")
                out.append(tag)
                i = end + 1
            else:
                end = src.find("<", i)
                end = n if end == -1 else end
                # stop the run at the next Jinja opener too
                for opener in ("{#", "{%", "{{"):
                    j = src.find(opener, i)
                    if j != -1:
                        end = min(end, j)
                run = src[i:end]
                if skip_depth or pending_icon or ALREADY.search(run):
                    out.append(run)
                else:
                    wrapped, _ = wrap_text(run)
                    out.append(wrapped)
                i = end
    return "".join(out)


def main():
    targets = sorted(pathlib.Path("templates").rglob("*.html"))
    for path in targets:
        src = path.read_text(encoding="utf-8")
        new = transform(src)
        if new != src:
            path.write_text(new, encoding="utf-8")
    print(f"{len(targets)} templates processed")
    print(f"  {stats['text']:5} text nodes wrapped")
    print(f"  {stats['attr']:5} attributes wrapped")


if __name__ == "__main__":
    main()
