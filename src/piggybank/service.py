"""Transactional allowance and pig domain service."""

from __future__ import annotations

import json
from datetime import date, datetime
from uuid import uuid4

from piggybank.schedule import TAIPEI, eligible_periods
from piggybank.store import Store


class DomainError(Exception):
    """Expected product error with a stable code and safe message."""

    code: str

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class PiggyService:
    def __init__(self, store: Store) -> None:
        self.store = store

    def initialize(self, now: datetime) -> None:
        self.store.initialize()
        timestamp = now.astimezone(TAIPEI).isoformat()
        changed = False
        with self.store.transaction() as conn:
            if conn.execute(
                "SELECT 1 FROM warehouse_pages LIMIT 1"
            ).fetchone() is None:
                conn.execute(
                    """
                    INSERT INTO warehouse_pages (page_no, unlocked_at)
                    VALUES (1, ?)
                    """,
                    (timestamp,),
                )
                changed = True
            if conn.execute(
                "SELECT 1 FROM pigs WHERE status='growing' LIMIT 1"
            ).fetchone() is None:
                conn.execute(
                    """
                    INSERT INTO pigs (
                      id, tier_id, status, capacity, value, hit_count,
                      daily_yield, yield_cap, created_at
                    )
                    VALUES (?, 'basic-150', 'growing', 150, 0, 5, 1, 3, ?)
                    """,
                    (uuid4().hex, timestamp),
                )
                changed = True
            if changed:
                Store.bump_revision(conn)

    def set_allowance(
        self,
        amount: int,
        period: str,
        effective_date: date,
        now: datetime,
        weekday: int | None = None,
        monthday: int | None = None,
    ) -> int:
        if amount <= 0:
            raise ValueError("amount must be positive")
        if period == "daily":
            valid = weekday is None and monthday is None
        elif period == "weekly":
            valid = (
                weekday is not None
                and weekday in range(7)
                and monthday is None
            )
        elif period == "monthly":
            valid = (
                monthday is not None
                and monthday in range(1, 29)
                and weekday is None
            )
        else:
            valid = False
        if not valid:
            raise ValueError("invalid period fields")

        with self.store.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO allowance_rules (
                  amount, period, weekday, monthday, effective_date, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    amount,
                    period,
                    weekday,
                    monthday,
                    effective_date.isoformat(),
                    now.astimezone(TAIPEI).isoformat(),
                ),
            )
            Store.bump_revision(conn)
            return int(cursor.lastrowid)

    def state(self, now: datetime) -> dict:
        public_pig_fields = (
            "id",
            "tier_id",
            "status",
            "capacity",
            "value",
            "hit_count",
            "daily_yield",
            "yield_cap",
            "pending_yield",
            "page_no",
            "slot_no",
        )
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            revision = int(
                conn.execute(
                    "SELECT value FROM settings WHERE key='revision'"
                ).fetchone()["value"]
            )
            total = conn.execute(
                """
                SELECT COALESCE(SUM(value), 0) AS total
                FROM pigs
                WHERE status IN ('growing','full','reserved')
                """
            ).fetchone()["total"]
            active = conn.execute(
                "SELECT * FROM pigs WHERE status='growing'"
            ).fetchone()
            pages = []
            for page in conn.execute(
                "SELECT * FROM warehouse_pages ORDER BY page_no"
            ):
                pig_rows = conn.execute(
                    """
                    SELECT * FROM pigs
                    WHERE page_no=? AND status IN ('full','reserved')
                    ORDER BY slot_no
                    """,
                    (page["page_no"],),
                ).fetchall()
                pages.append(
                    {
                        "page_no": page["page_no"],
                        "complete": len(pig_rows) == 6,
                        "pending_bonus": page["pending_bonus"],
                        "pigs": [
                            {field: pig[field] for field in public_pig_fields}
                            for pig in pig_rows
                        ],
                    }
                )
            rules = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM allowance_rules ORDER BY effective_date, id"
                )
            ]
            claimed_keys = {
                row["period_key"]
                for row in conn.execute("SELECT period_key FROM claims")
            }
            return {
                "revision": revision,
                "total": total,
                "active_pig": (
                    {field: active[field] for field in public_pig_fields}
                    if active is not None
                    else None
                ),
                "warehouse_pages": pages,
                "claimable_periods": eligible_periods(
                    rules,
                    claimed_keys,
                    now,
                ),
            }
        finally:
            conn.close()

    def claim(self, requested_period_key: str, now: datetime) -> dict:
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            rules = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM allowance_rules ORDER BY effective_date, id"
                )
            ]
            claimed_keys = {
                row["period_key"]
                for row in conn.execute("SELECT period_key FROM claims")
            }
            eligible = eligible_periods(rules, claimed_keys, now)
            selected = next(
                (
                    item
                    for item in eligible
                    if item["period_key"] == requested_period_key
                ),
                None,
            )
            if selected is None:
                raise DomainError("not_claimable", "這一期不能領取")

            conn.execute(
                """
                INSERT INTO claims (
                  id, rule_id, period_key, amount, claim_kind, claimed_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    selected["rule_id"],
                    selected["period_key"],
                    selected["amount"],
                    selected["claim_kind"],
                    timestamp,
                ),
            )
            remaining = selected["amount"]
            today = now.astimezone(TAIPEI).date().isoformat()
            while remaining > 0:
                active = conn.execute(
                    """
                    SELECT id, value, capacity
                    FROM pigs
                    WHERE status='growing'
                    """
                ).fetchone()
                if active is None:
                    raise RuntimeError("growing pig missing")
                added = min(remaining, active["capacity"] - active["value"])
                new_value = active["value"] + added
                remaining -= added
                if new_value < active["capacity"]:
                    conn.execute(
                        "UPDATE pigs SET value=? WHERE id=?",
                        (new_value, active["id"]),
                    )
                    break

                pages = [
                    row["page_no"]
                    for row in conn.execute(
                        "SELECT page_no FROM warehouse_pages ORDER BY page_no"
                    )
                ]
                occupied = {
                    (row["page_no"], row["slot_no"])
                    for row in conn.execute(
                        """
                        SELECT page_no, slot_no
                        FROM pigs
                        WHERE status IN ('full','reserved')
                        """
                    )
                }
                destination = next(
                    (
                        (page_no, slot_no)
                        for page_no in pages
                        for slot_no in range(1, 7)
                        if (page_no, slot_no) not in occupied
                    ),
                    None,
                )
                if destination is None:
                    next_page = max(pages, default=0) + 1
                    conn.execute(
                        """
                        INSERT INTO warehouse_pages (page_no, unlocked_at)
                        VALUES (?, ?)
                        """,
                        (next_page, timestamp),
                    )
                    pages.append(next_page)
                    destination = (next_page, 1)

                page_no, slot_no = destination
                conn.execute(
                    """
                    UPDATE pigs
                    SET status='full', value=?, page_no=?, slot_no=?,
                        filled_at=?, last_yield_date=?
                    WHERE id=?
                    """,
                    (
                        new_value,
                        page_no,
                        slot_no,
                        timestamp,
                        today,
                        active["id"],
                    ),
                )
                full_count = conn.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM pigs
                    WHERE page_no=? AND status IN ('full','reserved')
                    """,
                    (page_no,),
                ).fetchone()["count"]
                if full_count == 6:
                    conn.execute(
                        """
                        UPDATE warehouse_pages
                        SET complete_since=?, last_bonus_date=?
                        WHERE page_no=?
                        """,
                        (timestamp, today, page_no),
                    )
                    if page_no == max(pages):
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO warehouse_pages (
                              page_no, unlocked_at
                            )
                            VALUES (?, ?)
                            """,
                            (page_no + 1, timestamp),
                        )
                conn.execute(
                    """
                    INSERT INTO pigs (
                      id, tier_id, status, capacity, value, hit_count,
                      daily_yield, yield_cap, created_at
                    )
                    VALUES (?, 'basic-150', 'growing', 150, 0, 5, 1, 3, ?)
                    """,
                    (uuid4().hex, timestamp),
                )
            balance = conn.execute(
                """
                SELECT COALESCE(SUM(value), 0) AS total
                FROM pigs
                WHERE status IN ('growing','full','reserved')
                """
            ).fetchone()["total"]
            revision = Store.bump_revision(conn)
            conn.execute(
                """
                INSERT INTO ledger (
                  id, kind, amount, balance_after, note,
                  metadata, created_at, revision
                )
                VALUES (?, 'allowance_claim', ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    selected["amount"],
                    balance,
                    (
                        "今日零用金"
                        if selected["claim_kind"] == "on_time"
                        else "補領零用金"
                    ),
                    json.dumps(
                        {
                            "period_key": selected["period_key"],
                            "claim_kind": selected["claim_kind"],
                            "rule_id": selected["rule_id"],
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    timestamp,
                    revision,
                ),
            )
            return {
                "revision": revision,
                "period_key": selected["period_key"],
                "amount": selected["amount"],
                "claim_kind": selected["claim_kind"],
            }
