# -*- coding: utf-8 -*-
"""PiggyBank mark: the pig's face plus a small bank word."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "icons"
PIG = OUT / "pig.png"
CREAM = (255, 236, 242, 255)
ROSE = (255, 107, 157, 255)


def _font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path(r"C:\Windows\Fonts\comic.ttf"),
        Path(r"C:\Windows\Fonts\Comic.ttf"),
        Path(r"C:\Windows\Fonts\segoepr.ttf"),
        Path(r"C:\Windows\Fonts\Gabriola.ttf"),
        Path(r"C:\Windows\Fonts\seguiemj.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _face() -> Image.Image:
    im = Image.open(PIG).convert("RGBA")
    mask = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    box = mask.getbbox()
    if box is None:
        raise RuntimeError("pig artwork has no visible pixels")
    body = im.crop(box)
    width, height = body.size
    head = body.crop((0, 0, width, int(height * 0.72)))
    head_box = head.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if head_box is not None:
        head = head.crop(head_box)
    return head


def make(size: int) -> Image.Image:
    scale = 4
    canvas = size * scale
    im = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    radius = int(canvas * 0.22)
    draw.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=radius, fill=CREAM)
    face = _face()
    target = int(canvas * 0.8)
    ratio = target / face.width
    face = face.resize(
        (target, max(1, int(face.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    fx = (canvas - face.width) // 2
    fy = int(canvas * 0.02)
    im.alpha_composite(face, (fx, fy))
    label = "bank"
    pill_w = int(canvas * 0.85)
    font = _font(int(canvas * 0.2))
    text_box = draw.textbbox((0, 0), label, font=font)
    tw = text_box[2] - text_box[0]
    th = text_box[3] - text_box[1]
    while tw > pill_w - int(canvas * 0.08) and font.size > 8:
        font = _font(font.size - 2)
        text_box = draw.textbbox((0, 0), label, font=font)
        tw = text_box[2] - text_box[0]
        th = text_box[3] - text_box[1]
    pill_h = th + int(canvas * 0.07)
    px = (canvas - pill_w) // 2
    py = canvas - pill_h - int(canvas * 0.045)
    draw.rounded_rectangle((px, py, px + pill_w, py + pill_h), radius=pill_h // 2, fill=ROSE)
    tx = px + (pill_w - tw) // 2 - text_box[0]
    ty = py + (pill_h - th) // 2 - text_box[1]
    draw.text((tx, ty), label, font=font, fill=(255, 255, 255, 255))
    out = im.resize((size, size), Image.Resampling.LANCZOS)
    if size >= 64:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=80, threshold=2))
    background = Image.new("RGB", out.size, (255, 236, 242))
    background.paste(out, mask=out.getchannel("A"))
    return background


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make(180).save(OUT / "piggy-180.png", "PNG")
    make(192).save(OUT / "piggy-192.png", "PNG")
    ico = make(256)
    sizes = [(256, 256), (64, 64), (48, 48), (32, 32), (16, 16)]
    ico.save(OUT / "piggy-v3.ico", format="ICO", sizes=sizes)
    print(OUT / "piggy-180.png")
    print(OUT / "piggy-v3.ico")


if __name__ == "__main__":
    main()
