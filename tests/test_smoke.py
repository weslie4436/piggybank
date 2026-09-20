"""Smoke tests for PiggyBank package skeleton."""

import unittest

from piggybank import paths
from piggybank.__main__ import build_parser


class TestPaths(unittest.TestCase):
    def test_default_port(self):
        self.assertEqual(paths.PORT, 8771)

    def test_db_path_name(self):
        self.assertEqual(paths.DB_PATH.name, "piggybank.sqlite3")


class TestParser(unittest.TestCase):
    def test_subcommand_names_accepted(self):
        parser = build_parser()
        for name in ("vault", "setup", "ensure-shortcut"):
            with self.subTest(subcommand=name):
                args = parser.parse_args([name])
                self.assertEqual(args.command, name)


if __name__ == "__main__":
    unittest.main()
