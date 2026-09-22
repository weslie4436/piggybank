"""Tests for PiggyBank SQLite store layer."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from piggybank.store import Store

EXPECTED_TABLES = (
    "settings",
    "allowance_rules",
    "claims",
    "pigs",
    "warehouse_pages",
    "ledger",
    "exchanges",
    "pin_attempts",
    "children",
    "grants",
)

EXPECTED_INDEXES = (
    "one_growing_pig",
    "warehouse_slot",
    "ledger_created",
    "exchanges_status",
    "children_name",
)


class TestStoreInitialize(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def _table_names(self) -> set[str]:
        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
            return {row[0] for row in rows}
        finally:
            conn.close()

    def _index_names(self) -> set[str]:
        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
            return {row[0] for row in rows}
        finally:
            conn.close()

    def test_initialize_creates_all_tables_and_indexes(self):
        self.store.initialize()
        self.assertEqual(set(EXPECTED_TABLES), self._table_names())
        self.assertEqual(set(EXPECTED_INDEXES), self._index_names())

    def test_initialize_sets_revision_zero(self):
        self.store.initialize()
        snap = self.store.snapshot()
        self.assertEqual(snap["revision"], 0)

    def test_initialize_is_idempotent(self):
        self.store.initialize()
        self.store.initialize()
        self.assertEqual(set(EXPECTED_TABLES), self._table_names())
        self.assertEqual(self.store.snapshot()["revision"], 0)


class TestStoreTransaction(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.store.initialize()

    def tearDown(self):
        self.tmp.cleanup()

    def test_transaction_commits_on_success(self):
        with self.store.transaction() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('probe', 'yes')"
            )
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='probe'"
            ).fetchone()
        finally:
            conn.close()
        self.assertEqual(row[0], "yes")

    def test_transaction_rolls_back_on_exception(self):
        with self.assertRaises(ValueError):
            with self.store.transaction() as conn:
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES ('probe', 'no')"
                )
                raise ValueError("boom")
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='probe'"
            ).fetchone()
        finally:
            conn.close()
        self.assertIsNone(row)

    def test_bump_revision_increments_atomically(self):
        with self.store.transaction() as conn:
            first = Store.bump_revision(conn)
            second = Store.bump_revision(conn)
        self.assertEqual(first, 1)
        self.assertEqual(second, 2)
        self.assertEqual(self.store.snapshot()["revision"], 2)


if __name__ == "__main__":
    unittest.main()
