"""Draw a simple stack-of-books icon and save it at 48px and 128px.

Usage: python3 scripts/make_icons.py extension    (needs Pillow: pip install pillow)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

S = 8                      # supersampling factor: design units are 128px, canvas is 1024px
CANVAS = 128 * S

# Colours borrowed from badge.css so the icon matches the widget
TEAL, TEAL_DARK = "#00635d", "#003f3b"
AMBER, AMBER_DARK = "#b45309", "#7a3806"
GREEN, GREEN_DARK = "#1a7f37", "#0f5223"
PAGES, PAGES_LINE = "#fbf6ea", "#d9cfb8"


def tint(hex_colour, amount=0.35):
    """Opaque mix of a colour toward white (ImageDraw doesn't blend, so no alpha here)."""
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return tuple(round(c + (255 - c) * amount) for c in (r, g, b)) + (255,)


def u(*vals):
    """Design units (0-128) -> canvas pixels."""
    return [v * S for v in vals]


def book(x0, y0, x1, y1, fill, dark, pages_right=True):
    """One book lying flat, spine toward the viewer, pages showing at one end."""
    layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = 5
    outline = 3
    band = tint(fill)

    # Cover/spine body with a dark outline
    d.rounded_rectangle(u(x0, y0, x1, y1), radius=r * S, fill=dark)
    d.rounded_rectangle(u(x0 + outline, y0 + outline, x1 - outline, y1 - outline),
                        radius=(r - 2) * S, fill=fill)

    # Page block at one end
    h = y1 - y0
    pw = 12  # page block width
    if pages_right:
        px0, px1 = x1 - outline - pw, x1 - outline
    else:
        px0, px1 = x0 + outline, x0 + outline + pw
    py0, py1 = y0 + outline + 2, y1 - outline - 2
    d.rectangle(u(px0, py0, px1, py1), fill=PAGES)
    for i in range(1, 4):  # faint page lines
        ly = py0 + (py1 - py0) * i / 4
        d.line(u(px0, ly, px1, ly), fill=PAGES_LINE, width=S)

    # Two decorative bands on the spine, away from the page end
    spine_x0 = x0 + outline if pages_right else px1
    spine_x1 = px0 if pages_right else x1 - outline
    for bx in (spine_x0 + 7, spine_x1 - 10):
        d.rectangle(u(bx, y0 + outline, bx + 3, y1 - outline), fill=band)

    # Small title label in the middle of the spine
    mid = (spine_x0 + spine_x1) / 2
    lh = max(h * 0.28, 5)
    d.rounded_rectangle(u(mid - 13, (y0 + y1) / 2 - lh / 2, mid + 13, (y0 + y1) / 2 + lh / 2),
                        radius=1.5 * S, fill=band)
    return layer


def main(out_dir: Path):
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    # Bottom to top, each slightly offset so the stack looks hand-placed
    img.alpha_composite(book(8, 86, 120, 118, TEAL, TEAL_DARK, pages_right=True))
    img.alpha_composite(book(18, 56, 112, 88, AMBER, AMBER_DARK, pages_right=False))

    top = book(14, 26, 104, 58, GREEN, GREEN_DARK, pages_right=True)
    top = top.rotate(5, resample=Image.BICUBIC, center=(59 * S, 56 * S))
    img.alpha_composite(top)

    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (48, 128):
        img.resize((size, size), Image.LANCZOS).save(out_dir / f"icon{size}.png", optimize=True)
        print("wrote", out_dir / f"icon{size}.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
