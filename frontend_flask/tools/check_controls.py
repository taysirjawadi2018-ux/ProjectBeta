#!/usr/bin/env python3
"""Report the controls still needing a destination, per template."""
import pathlib, re, sys
rows = []
for path in sorted(pathlib.Path("templates").rglob("*.html")):
    text = path.read_text(encoding="utf-8")
    body = re.sub(r"\{#.*?#\}", "", text, flags=re.S)
    dead_href = len(re.findall(r'href="#"', body))
    dead_btn = [b for b in re.findall(r"<button[^>]*>", body)
                if 'type="submit"' not in b and "data-action" not in b]
    inline = len(re.findall(r'\sstyle="', body)) + len(re.findall(r'\son[a-z]+="', body))
    styles = len(re.findall(r"<style", body))
    remote = len(re.findall(r"cdn\.tailwindcss|fonts\.googleapis|fonts\.gstatic|lh3\.googleusercontent", body))
    inline_js = len([m for m in re.findall(r"<script[^>]*>(.*?)</script>", body, re.S) if m.strip()])
    total = dead_href + len(dead_btn) + inline + styles + remote + inline_js
    if total:
        rows.append((total, path.name, dead_href, len(dead_btn), inline, styles, remote, inline_js))
rows.sort(reverse=True)
print(f"{'template':<30}{'href#':>6}{'btn':>5}{'inline':>7}{'style':>6}{'remote':>7}{'js':>4}")
for total, name, a, b, c, d, e, f in rows:
    print(f"{name:<30}{a:>6}{b:>5}{c:>7}{d:>6}{e:>7}{f:>4}")
print(f"\n{len(rows)} templates with work left, {sum(r[0] for r in rows)} issues")
