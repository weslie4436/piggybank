"""Tests for safe exchange QR generation."""

from __future__ import annotations

import unittest
import xml.etree.ElementTree as ET

from piggybank.qr import qr_svg


class TestQrSvg(unittest.TestCase):
    def test_https_url_produces_valid_svg_with_qr_path(self):
        url = "https://example.github.io/PiggyBank/exchange.html?x=opaque-token"

        payload = qr_svg(url)

        self.assertIsInstance(payload, bytes)
        root = ET.fromstring(payload)
        self.assertEqual("svg", root.tag.rsplit("}", 1)[-1])
        self.assertTrue(
            any(node.tag.rsplit("}", 1)[-1] == "path" for node in root.iter())
        )
        self.assertNotIn(b"VAULT_ORIGIN", payload)
        self.assertNotIn(b"pin=", payload.lower())

    def test_non_https_urls_are_rejected(self):
        for url in (
            "http://example.com/exchange.html?x=token",
            "file:///tmp/exchange.html?x=token",
            "/exchange.html?x=token",
            "",
        ):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    qr_svg(url)


if __name__ == "__main__":
    unittest.main()
