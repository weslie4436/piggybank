"""Generated project icons must exist for Pages and shortcuts."""

from pathlib import Path
import unittest

from piggybank.paths import WEB


class TestIcons(unittest.TestCase):
    def test_touch_and_shortcut_icons_exist(self):
        icons = WEB / "icons"
        for name in ("coin.jpg", "piggy-180.png", "piggy-192.png", "piggy-v1.ico"):
            path = icons / name
            self.assertTrue(path.is_file(), path)
            self.assertGreater(path.stat().st_size, 1000)
