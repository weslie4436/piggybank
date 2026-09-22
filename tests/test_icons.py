"""Generated project icons must exist for Pages and shortcuts."""

from pathlib import Path
import unittest

from piggybank.paths import WEB


class TestIcons(unittest.TestCase):
    def test_touch_and_shortcut_icons_exist(self):
        icons = WEB / "icons"
        for name in ("coin.png", "coin.jpg", "coin-sheet.png", "piggy-180.png", "piggy-192.png", "piggy-v3.ico"):
            path = icons / name
            self.assertTrue(path.is_file(), path)
            minimum = 200 if name == "coin-sheet.png" else 1000
            self.assertGreater(path.stat().st_size, minimum)
