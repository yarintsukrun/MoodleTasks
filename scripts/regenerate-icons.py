"""Regenerate app icons: solid dark purple bg, MT logo without glow halo."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path(__file__).resolve().parent / "logo-source.png"
OUT = ROOT / "public"

# App dark purple background (matches --bg)
BG = (15, 17, 23)
# Solid logo lavender (no glow fringe)
LOGO = (196, 168, 255)


def luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def is_logo_pixel(r: int, g: int, b: int) -> bool:
    """Keep only the solid MT letter core, not the soft glow."""
    lum = luminance(r, g, b)
    if lum < 145:
        return False
    return b >= 180 and r >= 130 and g >= 100 and b >= r * 0.85


def process_image(src: Image.Image) -> Image.Image:
    src = src.convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w, h), BG + (255,))

    src_px = src.load()
    out_px = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = src_px[x, y]
            if a < 32:
                continue
            if is_logo_pixel(r, g, b):
                out_px[x, y] = LOGO + (255,)

    return out


def apply_rounded_corners(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    """Clip to rounded rect; outer pixels are solid bg (no glow fringe)."""
    w, h = img.size
    radius = int(min(w, h) * radius_ratio)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    flat = img.convert("RGB")
    result = Image.new("RGB", (w, h), BG)
    result.paste(flat, (0, 0), mask)
    return result


def save_png(img: Image.Image, path: Path, size: int) -> None:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    px = resized.load()
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            if luminance(r, g, b) < 145 and not is_logo_pixel(r, g, b):
                px[x, y] = BG
    resized.save(path, "PNG", optimize=True)
    print(f"  wrote {path.name} ({size}x{size})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate PWA / favicon PNGs from a source logo.")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SRC,
        help=f"Square PNG source (default: {DEFAULT_SRC.name} next to this script)",
    )
    args = parser.parse_args()
    src_path = args.source.resolve()

    if not src_path.exists():
        print(
            f"Source image not found: {src_path}\n"
            "Place a square PNG at scripts/logo-source.png or pass --source /path/to/logo.png",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading {src_path.name}...")
    src = Image.open(src_path)
    processed = apply_rounded_corners(process_image(src))

    print("Exporting icons...")
    save_png(processed, OUT / "icon-512.png", 512)
    save_png(processed, OUT / "icon-192.png", 192)
    save_png(processed, OUT / "apple-touch-icon.png", 180)
    save_png(processed, OUT / "favicon.png", 32)
    print("Done.")


if __name__ == "__main__":
    main()
