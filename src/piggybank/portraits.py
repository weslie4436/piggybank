"""Child avatar and backdrop stored beside the vault database."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

def _safe_child(child_id: str) -> str:
    name = str(child_id or "child1")
    if (
        not name
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or ".." in name
    ):
        raise ValueError("invalid child")
    return name


def _cover_name(child_id: str) -> str:
    return _safe_child(child_id) + ".jpg"


def _backdrop_name(child_id: str) -> str:
    return _safe_child(child_id) + ".bg.jpg"


def _covers(data_root: Path) -> Path:
    dest = data_root / "covers"
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def _ready(path: Path) -> Path | None:
    if path.is_file() and path.stat().st_size > 0:
        return path
    return None


def cover_file(data_root: Path, child_id: str = "child1") -> Path | None:
    return _ready(data_root / "covers" / _cover_name(child_id))


def backdrop_file(data_root: Path, child_id: str = "child1") -> Path | None:
    return _ready(data_root / "covers" / _backdrop_name(child_id))


def meta(data_root: Path, child_id: str = "child1") -> dict:
    cover = cover_file(data_root, child_id)
    backdrop = backdrop_file(data_root, child_id)
    return {
        "has_cover": cover is not None,
        "cover_rev": int(cover.stat().st_mtime) if cover else 0,
        "has_backdrop": backdrop is not None,
        "backdrop_rev": int(backdrop.stat().st_mtime) if backdrop else 0,
    }


def _open_rgb(blob: bytes):
    from PIL import Image, ImageOps

    if not blob:
        raise ValueError("empty image")
    try:
        image = Image.open(BytesIO(blob))
        image.load()
    except Exception as error:
        raise ValueError("invalid image") from error
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def _write_jpeg(image, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    image.save(tmp, "JPEG", quality=86, optimize=True)
    tmp.replace(dest)
    return dest


def save_cover_image(data_root: Path, blob: bytes, child_id: str = "child1") -> Path:
    image = _open_rgb(blob)
    width, height = image.size
    side = min(width, height)
    if side <= 0:
        raise ValueError("empty image")
    image = image.crop(
        (
            (width - side) // 2,
            (height - side) // 2,
            (width - side) // 2 + side,
            (height - side) // 2 + side,
        )
    )
    image.thumbnail((1200, 1200))
    return _write_jpeg(image, _covers(data_root) / _cover_name(child_id))


def save_backdrop_image(data_root: Path, blob: bytes, child_id: str = "child1") -> Path:
    image = _open_rgb(blob)
    width, height = image.size
    if width < 1 or height < 1:
        raise ValueError("empty image")
    image.thumbnail((1600, 1600))
    return _write_jpeg(image, _covers(data_root) / _backdrop_name(child_id))
