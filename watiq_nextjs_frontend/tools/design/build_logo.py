#!/usr/bin/env python3
"""Derive the Watiq brand assets from the master logo.png.

Run from the repository root:  python frontend_flask/tools/build_logo.py

The source is a 1024x1024 render on an opaque white field. Every consumer
needs it on something other than white -- the portal header is #001B3D -- so
white is converted to alpha rather than cropped around.
"""
from PIL import Image
import pathlib

SRC = pathlib.Path("logo.png")
# NOTE (moved 2026-08-17): this lived in frontend_flask/tools/. The Flask BFF is
# gone; these three generators are not, because deleting them would make the
# design tokens, the vendored fonts and the brand marks uneditable — their
# OUTPUT is committed, but nothing could regenerate it.
#
# Paths below now address the Next.js tree:
#     static/src/_tokens.css  ->  styles/_tokens.css
#     static/src/_fonts.css   ->  styles/_fonts.css
#     static/fonts/           ->  public/fonts/
#     static/img/             ->  public/img/
#     templates/**/*.html     ->  app/**/*.jsx + components/**/*.jsx

OUT = pathlib.Path("watiq_nextjs_frontend/public/img")

im = Image.open(SRC).convert("RGB")
px = im.load()
w, h = im.size

# Un-premultiply against white: a pixel that is k% white becomes k% transparent
# and its residual colour is recovered. Straight thresholding would leave a
# white fringe on the anti-aliased curves of the arch.
rgba = Image.new("RGBA", (w, h))
out = rgba.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        a = 255 - min(r, g, b)
        if a == 0:
            out[x, y] = (0, 0, 0, 0)
            continue
        f = a / 255.0
        out[x, y] = (
            min(255, max(0, round((r - 255 * (1 - f)) / f))),
            min(255, max(0, round((g - 255 * (1 - f)) / f))),
            min(255, max(0, round((b - 255 * (1 - f)) / f))),
            a,
        )

BBOX = (114, 360, 910, 664)       # full lockup
MARK = (114, 360, 426, 664)       # arch monogram only
lockup = rgba.crop(BBOX)
mark = rgba.crop(MARK)

def inverse(img):
    """Light-background lockup -> dark-background lockup.

    Only the 'National Portal' line changes: it is neutral grey, which
    disappears on the navy header. The red mark and wordmark already carry
    enough contrast against #001B3D and are left untouched.
    """
    img = img.copy()
    p = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = p[x, y]
            if a == 0:
                continue
            if r - max(g, b) > 40:        # brand red, keep
                continue
            p[x, y] = (226, 232, 240, a)  # neutral-200 for the subtitle
    return img

def save(img, name, size=None):
    img = img.resize(size, Image.LANCZOS) if size else img
    img.save(OUT / name, optimize=True)
    print(f"{name:28} {img.width}x{img.height}")

def padded(square, bg=None):
    """Square icon from the mark with 12% breathing room."""
    side = 512
    inner = round(side * 0.76)
    m = mark.copy()
    m.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (side, side), bg or (0, 0, 0, 0))
    canvas.paste(m, ((side - m.width) // 2, (side - m.height) // 2), m)
    return canvas

OUT.mkdir(parents=True, exist_ok=True)
save(lockup, "watiq-logo.png")
save(inverse(lockup), "watiq-logo-inverse.png")
save(mark, "watiq-mark.png")

icon_t = padded(512)
icon_w = padded(512, (255, 255, 255, 255))
save(icon_t, "watiq-icon-192.png", (192, 192))
save(icon_t, "watiq-icon-512.png", (512, 512))
save(icon_w, "apple-touch-icon.png", (180, 180))
save(icon_t, "favicon-32.png", (32, 32))
save(icon_t, "favicon-16.png", (16, 16))

icon_t.resize((48, 48), Image.LANCZOS).save(
    OUT.parent / "favicon.ico",
    sizes=[(16, 16), (32, 32), (48, 48)],
)
print("favicon.ico                  16/32/48")
