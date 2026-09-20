"""Tests for safe exchange QR generation."""

from __future__ import annotations

import unittest
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit, urlunsplit

from piggybank.paths import PAGES_BASE
from piggybank.qr import qr_svg


class TestQrSvg(unittest.TestCase):
    def exchange_url(self, query: str = "x=opaque-token") -> str:
        base = urlsplit(PAGES_BASE)
        path = f"{base.path.rstrip('/')}/exchange.html"
        return urlunsplit(("https", base.netloc, path, query, ""))

    def test_configured_pages_exchange_url_produces_valid_svg(self):
        url = self.exchange_url()

        payload = qr_svg(url)

        self.assertIsInstance(payload, bytes)
        root = ET.fromstring(payload)
        self.assertEqual("svg", root.tag.rsplit("}", 1)[-1])
        self.assertTrue(
            any(node.tag.rsplit("}", 1)[-1] == "path" for node in root.iter())
        )

    def test_urls_outside_exact_pages_exchange_contract_are_rejected(self):
        base = urlsplit(PAGES_BASE)
        path = f"{base.path.rstrip('/')}/exchange.html"
        valid = self.exchange_url()
        for url in (
            valid.replace("https://", "http://", 1),
            urlunsplit(("file", "", path, "x=token", "")),
            f"https://vault.example.invalid{path}?x=token",
            f"https://attacker.github.io{path}?x=token",
            urlunsplit(("https", base.netloc, f"{path}/extra", "x=token", "")),
            urlunsplit(("https", base.netloc, f"{base.path.rstrip('/')}/index.html", "x=token", "")),
            urlunsplit(("https", base.netloc, path, "", "")),
            self.exchange_url("x="),
            self.exchange_url("token=opaque-token"),
            self.exchange_url("x=token&pin=123456"),
            self.exchange_url("x=token&other=value"),
            self.exchange_url("x=first&x=second"),
            urlunsplit(("https", base.netloc, path, "x=token", "fragment")),
            urlunsplit(
                (
                    "https",
                    f"user:password@{base.netloc}",
                    path,
                    "x=token",
                    "",
                )
            ),
            "/exchange.html?x=token",
            "",
        ):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    qr_svg(url)


if __name__ == "__main__":
    unittest.main()
