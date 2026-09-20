"""Safe QR generation for exchange approval links."""

from __future__ import annotations

from io import BytesIO

import qrcode
from qrcode.image.svg import SvgPathImage


def qr_svg(url: str) -> bytes:
    if not isinstance(url, str) or not url.startswith("https://"):
        raise ValueError("QR URL must use https://")

    image = qrcode.make(url, image_factory=SvgPathImage)
    output = BytesIO()
    image.save(output)
    return output.getvalue()
