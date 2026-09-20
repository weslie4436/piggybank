# -*- coding: utf-8 -*-
"""Original three-color PiggyBank mark. No licensed character art."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "icons"

MELODY = (255, 107, 157)
KUROMI = (107, 91, 149)
CINNA = (126, 200, 227)
CREAM = (255, 245, 247)
INK = (45, 32, 48)
SLOT = (74, 48, 64)


def make(size: int) -> Image.Image:
    scale = 4
    canvas = size * scale
    s = canvas / 180.0
    im = Image.new("RGB", (canvas, canvas), CREAM)
    d = ImageDraw.Draw(im)

    d.rounded_rectangle(
        (8 * s, 8 * s, 172 * s, 172 * s),
        radius=36 * s,
        fill=CREAM,
    )
    d.ellipse((28 * s, 78 * s, 68 * s, 128 * s), fill=KUROMI)
    d.ellipse((112 * s, 78 * s, 152 * s, 128 * s), fill=CINNA)
    d.ellipse((34 * s, 44 * s, 146 * s, 150 * s), fill=MELODY)
    d.ellipse((78 * s, 32 * s, 102 * s, 58 * s), fill=MELODY)
    d.rounded_rectangle(
        (70 * s, 38 * s, 110 * s, 50 * s),
        radius=6 * s,
        fill=SLOT,
    )
    d.ellipse((68 * s, 88 * s, 112 * s, 122 * s), fill=(255, 183, 197))
    d.ellipse((74 * s, 96 * s, 86 * s, 108 * s), fill=INK)
    d.ellipse((94 * s, 96 * s, 106 * s, 108 * s), fill=INK)
    d.arc((76 * s, 102 * s, 104 * s, 126 * s), 20, 160, fill=INK, width=max(2, int(5 * s)))
    d.ellipse((128 * s, 118 * s, 150 * s, 140 * s), fill=CINNA)
    out = im.resize((size, size), Image.Resampling.LANCZOS)
    if size >= 64:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=90, threshold=2))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make(180).save(OUT / "piggy-180.png", "PNG")
    make(192).save(OUT / "piggy-192.png", "PNG")
    ico = make(256)
    sizes = [(256, 256), (64, 64), (48, 48), (32, 32), (16, 16)]
    ico.save(OUT / "piggy-v1.ico", format="ICO", sizes=sizes)
    print(OUT / "piggy-180.png")
    print(OUT / "piggy-v1.ico")


if __name__ == "__main__":
    main()
