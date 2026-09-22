"""SQLite storage layer for PiggyBank."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS allowance_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL CHECK(amount > 0),
      period TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly')),
      weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
      monthday INTEGER CHECK(monthday BETWEEN 1 AND 28),
      effective_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      rule_id INTEGER NOT NULL REFERENCES allowance_rules(id),
      period_key TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL CHECK(amount > 0),
      claim_kind TEXT NOT NULL CHECK(claim_kind IN ('on_time','makeup')),
      claimed_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pigs (
      id TEXT PRIMARY KEY,
      tier_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('growing','full','reserved','broken')),
      page_no INTEGER,
      slot_no INTEGER,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      value INTEGER NOT NULL CHECK(value >= 0),
      hit_count INTEGER NOT NULL CHECK(hit_count > 0),
      daily_yield INTEGER NOT NULL CHECK(daily_yield >= 0),
      yield_cap INTEGER NOT NULL CHECK(yield_cap >= 0),
      pending_yield INTEGER NOT NULL DEFAULT 0 CHECK(pending_yield >= 0),
      filled_at TEXT,
      last_yield_date TEXT,
      reserved_exchange_id TEXT,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS warehouse_pages (
      page_no INTEGER PRIMARY KEY,
      unlocked_at TEXT NOT NULL,
      complete_since TEXT,
      pending_bonus INTEGER NOT NULL DEFAULT 0 CHECK(pending_bonus BETWEEN 0 AND 6),
      last_bonus_date TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
      note TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      revision INTEGER NOT NULL UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','completed','cancelled','expired')),
      requested_amount INTEGER NOT NULL CHECK(requested_amount > 0),
      child_note TEXT NOT NULL,
      parent_note TEXT,
      pig_ids TEXT NOT NULL,
      total_pig_value INTEGER NOT NULL CHECK(total_pig_value >= 0),
      change_amount INTEGER NOT NULL CHECK(change_amount >= 0),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pin_attempts (
      scope TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0),
      locked_until TEXT
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS one_growing_pig
    ON pigs(status) WHERE status='growing'
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS warehouse_slot
    ON pigs(page_no, slot_no) WHERE page_no IS NOT NULL AND status IN ('full','reserved')
    """,
    """
    CREATE INDEX IF NOT EXISTS ledger_created
    ON ledger(created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS exchanges_status
    ON exchanges(status, expires_at)
    """,
    """
    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      store_kind TEXT NOT NULL CHECK(store_kind IN ('legacy','account')),
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS children_name
    ON children(display_name)
    """,
)


class Store:
    """SQLite-backed persistence for PiggyBank vault data."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = self._connect()
        try:
            for statement in SCHEMA_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                """
                INSERT OR IGNORE INTO settings (key, value)
                VALUES ('revision', '0')
                """
            )
            conn.commit()
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
        except Exception:
            conn.rollback()
            raise
        else:
            conn.commit()
        finally:
            conn.close()

    def snapshot(self) -> dict:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='revision'"
            ).fetchone()
            revision = int(row["value"]) if row is not None else 0
            return {"revision": revision}
        finally:
            conn.close()

    @staticmethod
    def bump_revision(conn: sqlite3.Connection) -> int:
        conn.execute(
            """
            UPDATE settings
            SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
            WHERE key='revision'
            """
        )
        row = conn.execute(
            "SELECT value FROM settings WHERE key='revision'"
        ).fetchone()
        if row is None:
            raise RuntimeError("settings.revision missing")
        return int(row["value"])
