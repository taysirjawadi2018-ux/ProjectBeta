#!/usr/bin/env python3
"""Generate the design-token layer from the source mockups.

The fifteen mockups in frontend/ each inline their own `tailwind.config` for
the Play CDN, and they do not agree: 39 colours, 6 font families, 6 type steps
and all 4 radii take different values from one page to the next. A Flask app
compiles one stylesheet, so a single flat config would silently restyle two
thirds of the screens.

Instead every token is emitted as a CSS variable:

    tailwind.config.js   primary -> rgb(var(--w-c-primary) / <alpha-value>)
    _tokens.css          :root   -> --w-c-primary: 0 0 0;
                         .tk-service-catalogue -> --w-c-primary: 0 27 61;

`:root` carries the most common value for each token and each `.tk-<page>`
class carries only the tokens that page disagrees about. Putting that class on
<html> switches the whole palette, so ported markup keeps the mockup's class
names verbatim and still renders with the mockup's colours.

Colours become "R G B" channel triplets rather than hex so that Tailwind's
opacity modifiers (bg-primary/95, border-outline-variant/20) keep working.

Run with `npm run tokens` after editing a mockup.
"""

from __future__ import annotations

import collections
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MOCKUPS = ROOT.parent / "frontend"

# Tokens the current templates use that no new mockup defines. Dropping them
# would break the screens that never had a mockup, so they are carried over
# from the previous tailwind.config.js as :root-only defaults.
LEGACY = {
    "colors": {},
    "borderRadius": {},
    "spacing": {"interpreter-slot-width": "320px", "base": "8px"},
    "fontFamily": {
        "headline-sm": ["Public Sans"],
        "display-lg-mobile": ["Public Sans"],
        "label-md": ["Public Sans"],
        "label-sm": ["Public Sans"],
    },
    "fontSize": {
        "headline-sm": ["24px", {"lineHeight": "1.3", "fontWeight": "600"}],
        "display-lg-mobile": ["32px", {"lineHeight": "1.2", "fontWeight": "700"}],
    },
}

PREFIX = {
    "colors": "c",
    "borderRadius": "r",
    "spacing": "sp",
    "fontFamily": "ff",
}

EXTRACTOR = r"""
const fs=require('fs'),path=require('path'),vm=require('vm');
const dir=process.argv[1];const out={};
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.html'))){
  const m=fs.readFileSync(path.join(dir,f),'utf8')
    .match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
  if(!m){continue;}
  const s={tailwind:{}};vm.createContext(s);vm.runInContext(m[1],s);
  out[f.replace(/\.html$/,'')]=(s.tailwind.config&&s.tailwind.config.theme
    &&s.tailwind.config.theme.extend)||{};
}
process.stdout.write(JSON.stringify(out));
"""


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def hex_to_channels(value: str) -> str | None:
    """'#af792f' -> '175 121 47'. Returns None for anything not plain hex."""
    match = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value.strip())
    if not match:
        return None
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    return " ".join(str(int(digits[i : i + 2], 16)) for i in (0, 2, 4))


def load_configs() -> dict[str, dict]:
    raw = subprocess.run(
        ["node", "-e", EXTRACTOR, str(MOCKUPS)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(raw)


def normalise(group: str, key: str, value) -> dict[str, str]:
    """Flatten one token into the CSS variables it needs."""
    if group == "colors":
        channels = hex_to_channels(value) if isinstance(value, str) else None
        if channels is None:
            return {}  # non-hex (one rgba()) is handled in the page stylesheet
        return {f"--w-c-{key}": channels}
    if group == "fontFamily":
        families = value if isinstance(value, list) else [value]
        # Every mockup names a single family and relies on the browser default
        # for fallback; keep a sans-serif backstop so a failed font load does
        # not land on Times.
        return {f"--w-ff-{key}": ", ".join(f"'{f}'" for f in families) + ", sans-serif"}
    if group == "fontSize":
        size, meta = (value + [{}])[:2] if isinstance(value, list) else [value, {}]
        return {
            f"--w-fs-{key}": size,
            f"--w-lh-{key}": meta.get("lineHeight", "1.5"),
            f"--w-ls-{key}": meta.get("letterSpacing", "normal"),
            f"--w-fw-{key}": meta.get("fontWeight", "400"),
        }
    return {f"--w-{PREFIX[group]}-{key}": value}


def main() -> None:
    configs = load_configs()
    groups = ("colors", "borderRadius", "spacing", "fontFamily", "fontSize")

    # page -> {css-var: value}
    per_page: dict[str, dict[str, str]] = {}
    for page, extend in configs.items():
        flat: dict[str, str] = {}
        for group in groups:
            for key, value in (extend.get(group) or {}).items():
                flat.update(normalise(group, key, value))
        per_page[page] = flat

    # Defaults: the most common value wins, ties broken by the page count of
    # the family that owns the largest share of screens.
    all_vars = {name for flat in per_page.values() for name in flat}
    defaults: dict[str, str] = {}
    for name in sorted(all_vars):
        counts = collections.Counter(
            flat[name] for flat in per_page.values() if name in flat
        )
        defaults[name] = counts.most_common(1)[0][0]

    # Legacy tokens are :root-only; no mockup overrides them.
    legacy_keys: dict[str, list[str]] = {g: [] for g in groups}
    for group, tokens in LEGACY.items():
        for key, value in tokens.items():
            variables = normalise(group, key, value)
            if any(name in defaults for name in variables):
                continue  # a mockup already defines it -- the redesign wins
            legacy_keys[group].append(key)
            defaults.update(variables)

    token_keys: dict[str, list[str]] = {}
    for group in groups:
        keys = {
            key
            for extend in configs.values()
            for key in (extend.get(group) or {})
            if group != "colors" or hex_to_channels((extend.get(group) or {})[key])
        }
        token_keys[group] = sorted(keys | set(legacy_keys[group]))

    write_config(token_keys)
    write_tokens_css(defaults, per_page)

    overrides = sum(
        1
        for page, flat in per_page.items()
        for name, value in flat.items()
        if defaults.get(name) != value
    )
    print(
        f"{len(defaults)} tokens in :root, "
        f"{len(per_page)} page themes, {overrides} overrides"
    )


def write_config(token_keys: dict[str, list[str]]) -> None:
    def block(group: str, render) -> str:
        lines = [f"      {group}: {{"]
        for key in token_keys[group]:
            lines.append(f'        "{key}": {render(key)},')
        lines.append("      },")
        return "\n".join(lines)

    body = "\n".join(
        [
            block("colors", lambda k: f'"rgb(var(--w-c-{k}) / <alpha-value>)"'),
            block("borderRadius", lambda k: f'"var(--w-r-{k})"'),
            block("spacing", lambda k: f'"var(--w-sp-{k})"'),
            block("fontFamily", lambda k: f'"var(--w-ff-{k})"'),
            block(
                "fontSize",
                lambda k: (
                    f'[\n          "var(--w-fs-{k})",\n'
                    f"          {{\n"
                    f'            lineHeight: "var(--w-lh-{k})",\n'
                    f'            letterSpacing: "var(--w-ls-{k})",\n'
                    f'            fontWeight: "var(--w-fw-{k})",\n'
                    f"          }},\n        ]"
                ),
            ),
        ]
    )

    (ROOT / "tailwind.config.js").write_text(
        "/**\n"
        " * Watiq design tokens. GENERATED by tools/build_tokens.py -- do not edit.\n"
        " *\n"
        " * Every token resolves to a CSS variable defined in static/src/_tokens.css.\n"
        " * The fifteen source mockups disagree about most of these values, so the\n"
        " * variable is what lets one compiled stylesheet render each screen with the\n"
        " * palette and type scale its own mockup specified: <html> carries a\n"
        " * .tk-<page> class that rebinds the variables it disagrees about.\n"
        " *\n"
        " * Colours are `R G B` channel triplets so Tailwind's opacity modifiers\n"
        " * (bg-primary/95, border-outline-variant/20) still compile.\n"
        " *\n"
        " * Plugins match the CDN query string the mockups used:\n"
        " *   cdn.tailwindcss.com?plugins=forms,container-queries\n"
        " */\n"
        'module.exports = {\n  darkMode: "class",\n'
        # The page scripts add utilities at runtime (the landing page's header
        # swaps h-20 for h-16/bg-surface/95/backdrop-blur-md on scroll). Those
        # class names appear nowhere in a template, so without this glob the
        # scanner never emits them and the scroll state renders unstyled.
        '  content: ["./templates/**/*.html", "./static/js/**/*.js"],\n'
        "  theme: {\n    extend: {\n"
        f"{body}\n"
        "    },\n  },\n"
        "  plugins: [\n"
        '    require("@tailwindcss/forms"),\n'
        '    require("@tailwindcss/container-queries"),\n'
        "  ],\n};\n",
        encoding="utf-8",
    )


def write_tokens_css(
    defaults: dict[str, str], per_page: dict[str, dict[str, str]]
) -> None:
    out = [
        "/* Watiq design tokens. GENERATED by tools/build_tokens.py -- do not edit.",
        " *",
        " * :root holds the value each token takes on the majority of screens.",
        " * Each .tk-<page> class below lists only the tokens that page's mockup",
        " * set differently, and is applied to <html> by that page's template.",
        " */",
        ":root {",
    ]
    for name in sorted(defaults):
        out.append(f"  {name}: {defaults[name]};")
    out.append("}")

    for page in sorted(per_page):
        diff = {
            name: value
            for name, value in sorted(per_page[page].items())
            if defaults.get(name) != value
        }
        if not diff:
            continue
        out.append("")
        out.append(f".tk-{slugify(page)} {{")
        for name, value in diff.items():
            out.append(f"  {name}: {value};")
        out.append("}")

    (ROOT / "static" / "src" / "_tokens.css").write_text(
        "\n".join(out) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
