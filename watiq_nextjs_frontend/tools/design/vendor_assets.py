#!/usr/bin/env python3
"""Vendor every remote asset the design mockups reference.

The production CSP (ops/nginx/snippets/security-headers.conf) is

    default-src 'none'; script-src 'self'; style-src 'self';
    font-src 'self'; img-src 'self' data:

so nothing may be fetched from fonts.googleapis.com, fonts.gstatic.com or
lh3.googleusercontent.com at runtime. This script pulls all of it down once:

  * the five text/icon faces the mockups load from Google Fonts
  * the Material Symbols subset, derived from the icon ligatures that actually
    appear in templates/ and frontend/ -- previously this subset was built by
    hand, so adding an icon to a template made it render as literal ligature
    text until someone remembered to regenerate the font
  * every lh3.googleusercontent.com image, keyed by sha1 so the filename is
    stable across runs

Run with `npm run vendor` after changing icons or adding a mockup image.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys
import urllib.request

# NOTE (moved 2026-08-17): this lived in frontend_flask/tools/. The Flask BFF is
# gone; these three generators are not, because deleting them would make the
# design tokens, the vendored fonts and the brand marks uneditable — their
# OUTPUT is committed, but nothing could regenerate it.
#
# Paths below now address the Next.js tree:
#     static/src/_tokens.css  ->  styles/_tokens.css
#     styles/_fonts.css   ->  styles/_fonts.css
#     static/fonts/           ->  public/fonts/
#     static/img/             ->  public/img/
#     templates/**/*.html     ->  app/**/*.jsx + components/**/*.jsx

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / "public" / "fonts"
# public/, not static/ — the line in the note above that this one was missed by.
# Pointed at static/img this rebuilt the manifest from an empty dict in a
# directory nothing serves, so the run reported success, left the real
# public/img/manifest.json stale, and served no image from the new one.
IMAGES = ROOT / "public" / "img"
MOCKUPS = ROOT.parent / "frontend"

# Where the browser fetches a vendored face from, and therefore what has to go
# in the url() token.
#
# Root-relative, not '../fonts/'. A relative url() resolves against the
# stylesheet that carries it, and Next emits no rewrite for these: under Flask
# the sheet was served from /static/css/ so '../fonts/' landed on
# /static/fonts/, but the compiled sheet is now /_next/static/css/<hash>.css,
# where the same token resolves to /_next/static/fonts/ and 404s — every face
# at once, the icons included, which is a portal rendering in a fallback serif
# with its ligatures spelled out as words.
FONT_URL_PREFIX = "/fonts"

# A browser UA is required: Google serves ttf to unrecognised clients and woff2
# only to engines it knows support it.
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# Variable-weight ranges are the real axis limits published for each family;
# asking for a wider range than the font has makes the API fall back to static
# instances, which would mean one file per weight.
TEXT_FONTS = {
    "Manrope": "wght@200..800",
    "Work Sans": "wght@100..900",
    "JetBrains Mono": "wght@100..800",
    "Public Sans": "wght@100..900",
    # Arabic UI face. The Latin families above carry no Arabic coverage, so
    # without this the Arabic locale falls through to whatever the OS happens
    # to have — which font-src 'self' cannot vouch for and which renders the
    # portal in a different voice on every machine.
    "Noto Sans Arabic": "wght@100..900",
}

# The portal ships in English, French and Arabic. The Latin families have no
# arabic subset, so naming it here costs nothing for them and picks up the one
# face that does.
WANTED_SUBSETS = ("latin", "latin-ext", "arabic")


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-")


# Google's own catalogue of Material Symbols names. Every candidate below is
# checked against it, which is what makes the loose patterns safe: a word that
# merely looks like an icon name cannot enter the subset, so the scrapers are
# free to over-reach rather than having to parse JSX exactly.
ICON_METADATA = "https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols"

# A literal ligature written straight into the markup: <span class="material-
# symbols-outlined">badge</span>.
ICON_CHILD = re.compile(r"material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*<")

# An icon named through a prop or a record field -- <EmptyState icon="folder_open" />,
# `{ icon: 'warning' }`. Deliberately matched BEFORE attributes are masked
# below, because for this one attribute the value is exactly what we want.
ICON_PROP = re.compile(r"(?<![-\w])icon\s*[:=]\s*\{?\s*['\"]([a-z][a-z0-9_]*)['\"]")

# Every OTHER attribute value gets blanked before the loose scrape runs.
# name="email", htmlFor="password", type="search" and slug="accessibility" are
# all real icon names and none of them is an icon.
OTHER_ATTR = re.compile(r"\b(?!icon\b)[A-Za-z_][\w:-]*\s*=\s*(['\"])(?:(?!\1).)*\1")

# A bare lowercase string literal, once attributes are out of the way.
BARE_LITERAL = re.compile(r"['\"]([a-z][a-z0-9_]{1,40})['\"]")

# public/js swaps ligatures at runtime: swapIcon(trigger, "pause") and
# `icon.textContent = "content_copy"`. Nothing in the markup names these, so a
# scrape of the JSX alone ships a button whose icon turns into a word on click.
JS_SWAP = re.compile(r"swapIcon\s*\([^,]+,\s*(.*?)\)\s*;", re.S)
JS_TEXT = re.compile(r"\w*[Ii]con\w*\s*\.textContent\s*=\s*(.*?);", re.S)


def icon_catalogue() -> set[str]:
    """Every name Google will actually mint a ligature for."""
    raw = fetch(ICON_METADATA).decode("utf-8")
    # The response is JSON behind an anti-hijacking prefix -- )]}' on line one.
    payload = json.loads(raw[raw.index("{"):])
    return {icon["name"] for icon in payload["icons"]}


def collect_icons() -> list[str]:
    """Every Material Symbols ligature the portal can render.

    Matching a literal ligature child is not enough on its own, and that gap is
    what put fourteen icons on screen as their own names: the ligature is very
    often supplied dynamically -- from a tuple table (`['Morning', 'light_mode',
    slots]`), an `icon` prop, a status map (`{ 404: 'search_off' }`), or a
    ternary -- and none of those spellings sits between `>` and `<`. The icon
    still renders, so nothing fails; it just renders as the word `light_mode`,
    one 1em glyph per character, straight out of whatever box it was in.

    So the scrape is deliberately loose -- attributes that are not `icon` are
    masked out, then every remaining bare lowercase literal in a file that
    renders icons is a candidate -- and `catalogue` is what keeps it honest.
    """
    catalogue = icon_catalogue()
    names: set[str] = set()

    sources = list([*(ROOT / "app").rglob("*.jsx"), *(ROOT / "components").rglob("*.jsx")])
    if MOCKUPS.is_dir():
        sources += list(MOCKUPS.glob("*.html"))

    for path in sources:
        text = path.read_text(encoding="utf-8")
        names.update(ICON_CHILD.findall(text))
        names.update(ICON_PROP.findall(text))
        if "material-symbols-outlined" not in text:
            continue
        masked = OTHER_ATTR.sub(lambda m: " " * len(m.group(0)), text)
        names.update(BARE_LITERAL.findall(masked))

    for path in sorted((ROOT / "public" / "js").rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        for match in list(JS_SWAP.finditer(text)) + list(JS_TEXT.finditer(text)):
            names.update(BARE_LITERAL.findall(match.group(1)))

    names.discard("")
    unknown = names - catalogue
    names &= catalogue
    if unknown:
        # Not fatal: most of these are ordinary words the loose scrape swept up.
        # Printed so a genuine typo in an icon name is visible rather than
        # silently dropped and rendered as text later.
        print(f"  note  {len(unknown)} non-icon candidates ignored")
    return sorted(names)


def parse_faces(css: str) -> list[tuple[str, str]]:
    """Return (subset-comment, @font-face block) pairs from a Google Fonts CSS."""
    faces = []
    for match in re.finditer(
        r"/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css
    ):
        faces.append((match.group(1), match.group(2)))
    return faces


def vendor_text_fonts() -> list[str]:
    blocks: list[str] = []
    for family, axis in TEXT_FONTS.items():
        query = family.replace(" ", "+")
        css = fetch(
            f"https://fonts.googleapis.com/css2?family={query}:{axis}&display=swap"
        ).decode("utf-8")
        faces = parse_faces(css)
        if not faces:
            sys.exit(f"no @font-face blocks returned for {family}")
        for subset, block in faces:
            if subset not in WANTED_SUBSETS:
                continue
            url_match = re.search(r"url\((https://[^)]+\.woff2)\)", block)
            if not url_match:
                continue
            filename = f"{slugify(family)}-{subset}.woff2"
            (FONTS / filename).write_bytes(fetch(url_match.group(1)))
            print(f"  font  {filename}")
            # Point the existing src at our local copy and keep everything else
            # (weight range, format(), unicode-range) exactly as Google declared
            # it. Only the url() token is rewritten -- the format() that follows
            # is already in the block.
            blocks.append(
                block.replace(
                    url_match.group(0), f"url('{FONT_URL_PREFIX}/{filename}')"
                )
            )
    return blocks


def vendor_icon_font(icons: list[str]) -> str:
    (ROOT / "tools" / "icons.txt").write_text(
        "\n".join(icons) + "\n", encoding="utf-8"
    )
    css = fetch(
        "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
        ":wght,FILL@100..700,0..1"
        f"&icon_names={','.join(icons)}&display=block"
    ).decode("utf-8")
    url_match = re.search(r"url\((https://[^)]+)\)\s*format\('woff2'\)", css)
    if not url_match:
        sys.exit("Google returned no woff2 for the Material Symbols subset")
    data = fetch(url_match.group(1))
    (FONTS / "material-symbols-outlined.woff2").write_bytes(data)
    print(f"  font  material-symbols-outlined.woff2 ({len(icons)} icons, {len(data)//1024} KB)")
    return (
        "@font-face {\n"
        "  font-family: 'Material Symbols Outlined';\n"
        "  font-style: normal;\n"
        "  font-weight: 100 700;\n"
        "  font-display: block;\n"
        f"  src: url('{FONT_URL_PREFIX}/material-symbols-outlined.woff2')"
        " format('woff2');\n"
        "}"
    )


def vendor_images() -> dict[str, str]:
    urls: set[str] = set()
    # Two hosts, not one: the appointment-map mockup pulls its map plate from
    # images.unsplash.com rather than the generator's own CDN. img-src is
    # 'self' data:, so that one has to come down too or the map renders blank.
    pattern = re.compile(
        r"https://(?:lh3\.googleusercontent\.com|images\.unsplash\.com)/[^\"')\s]+"
    )
    for path in sorted(MOCKUPS.glob("*.html")):
        urls.update(pattern.findall(path.read_text(encoding="utf-8")))

    manifest_path = IMAGES / "manifest.json"
    manifest: dict[str, str] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    for url in sorted(urls):
        name = f"img-{hashlib.sha1(url.encode()).hexdigest()[:12]}.jpg"
        target = IMAGES / name
        if not target.exists():
            target.write_bytes(fetch(url))
            print(f"  image {name}")
        manifest[url] = name

    manifest_path.write_text(
        json.dumps(dict(sorted(manifest.items())), indent=1) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    FONTS.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)

    print("fonts:")
    blocks = vendor_text_fonts()
    icons = collect_icons()
    blocks.append(vendor_icon_font(icons))

    header = (
        "/* Generated by tools/vendor_assets.py -- do not edit by hand.\n"
        " *\n"
        " * Self-hosted copies of the faces the mockups pulled from Google Fonts.\n"
        " * Weight ranges and unicode-ranges are reproduced exactly as Google\n"
        " * declared them, so latin-ext is still only fetched by pages that use it.\n"
        " */\n"
    )
    (ROOT / "styles" / "_fonts.css").write_text(
        header + "\n".join(blocks) + "\n", encoding="utf-8"
    )

    print("images:")
    manifest = vendor_images()
    print(f"\n{len(manifest)} images in manifest, {len(icons)} icons subsetted")


if __name__ == "__main__":
    main()
