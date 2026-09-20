"""Safe QR generation for exchange approval links."""

from __future__ import annotations

from io import BytesIO
from urllib.parse import parse_qsl, urlsplit

import qrcode
from qrcode.image.svg import SvgPathImage

from piggybank.paths import PAGES_BASE


def qr_svg(url: str) -> bytes:
    if not isinstance(url, str):
        raise ValueError("invalid exchange QR URL")

    try:
        parsed = urlsplit(url)
        pages = urlsplit(PAGES_BASE)
        query = parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
        )
    except ValueError as error:
        raise ValueError("invalid exchange QR URL") from error

    exchange_path = f"{pages.path.rstrip('/')}/exchange.html"
    if (
        parsed.scheme != "https"
        or parsed.netloc != pages.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path != exchange_path
        or parsed.fragment
        or len(query) != 1
        or query[0][0] != "x"
        or not query[0][1].strip()
    ):
        raise ValueError("invalid exchange QR URL")

    image = qrcode.make(url, image_factory=SvgPathImage)
    output = BytesIO()
    image.save(output)
    return output.getvalue()
