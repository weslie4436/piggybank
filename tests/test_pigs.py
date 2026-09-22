"""Tests for transactional allowance and pig filling behavior."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from piggybank.schedule import due_at
from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")


class PiggyServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.service = PiggyService(self.store)
        self.now = datetime(2026, 9, 21, 19, 0, tzinfo=TAIPEI)

    def tearDown(self):
        self.tmp.cleanup()

    def rows(self, query: str, parameters: tuple = ()) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(query, parameters).fetchall()
        finally:
            conn.close()


class TestInitializeAndAllowance(PiggyServiceTestCase):
    def test_initialize_creates_one_pig_and_default_daily_allowance_once(self):
        self.service.initialize(self.now)
        self.service.initialize(self.now)

        pigs = self.rows("SELECT * FROM pigs ORDER BY created_at, id")
        rules = self.rows("SELECT * FROM allowance_rules")
        self.assertEqual(1, len(pigs))
        self.assertEqual(
            {
                "tier_id": "basic-150",
                "status": "growing",
                "capacity": 150,
                "value": 0,
                "hit_count": 5,
                "daily_yield": 1,
                "yield_cap": 3,
                "pending_yield": 0,
                "page_no": None,
                "slot_no": None,
                "filled_at": None,
                "last_yield_date": None,
                "reserved_exchange_id": None,
            },
            {
                key: pigs[0][key]
                for key in (
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
                    "filled_at",
                    "last_yield_date",
                    "reserved_exchange_id",
                )
            },
        )
        self.assertEqual(1, len(rules))
        self.assertEqual(
            (30, "daily", None, None, "2026-09-15"),
            (
                rules[0]["amount"],
                rules[0]["period"],
                rules[0]["weekday"],
                rules[0]["monthday"],
                rules[0]["effective_date"],
            ),
        )
        self.assertEqual(1, self.store.snapshot()["revision"])
        opened = self.service.state(self.now)["claimable_periods"]
        self.assertEqual(7, len(opened))
        self.assertEqual("2026-09-15", opened[0]["period_key"])
        self.assertEqual("2026-09-21", opened[-1]["period_key"])
        self.assertTrue(all(item["amount"] == 30 for item in opened))

    def test_set_allowance_accepts_period_specific_fields_and_bumps_once(self):
        self.service.initialize(self.now)

        daily_id = self.service.set_allowance(
            30,
            "daily",
            date(2026, 9, 21),
            self.now,
        )
        weekly_id = self.service.set_allowance(
            50,
            "weekly",
            date(2026, 9, 22),
            self.now,
            weekday=1,
        )
        monthly_id = self.service.set_allowance(
            80,
            "monthly",
            date(2026, 10, 1),
            self.now,
            monthday=15,
        )

        rules = self.rows("SELECT * FROM allowance_rules ORDER BY id")
        self.assertEqual(
            [daily_id, weekly_id, monthly_id],
            [row["id"] for row in rules][-3:],
        )
        self.assertEqual(
            [
                ("daily", None, None),
                ("daily", None, None),
                ("weekly", 1, None),
                ("monthly", None, 15),
            ],
            [
                (row["period"], row["weekday"], row["monthday"])
                for row in rules
            ],
        )
        self.assertEqual(4, self.store.snapshot()["revision"])

    def test_set_allowance_rejects_invalid_period_fields_without_changes(self):
        self.service.initialize(self.now)
        invalid = (
            (0, "daily", None, None),
            (30, "unknown", None, None),
            (30, "daily", 1, None),
            (30, "daily", None, 1),
            (30, "weekly", None, None),
            (30, "weekly", 7, None),
            (30, "weekly", 1, 1),
            (30, "monthly", None, None),
            (30, "monthly", None, 29),
            (30, "monthly", 1, 15),
        )

        for amount, period, weekday, monthday in invalid:
            with self.subTest(
                amount=amount,
                period=period,
                weekday=weekday,
                monthday=monthday,
            ):
                with self.assertRaises(ValueError):
                    self.service.set_allowance(
                        amount,
                        period,
                        date(2026, 9, 21),
                        self.now,
                        weekday=weekday,
                        monthday=monthday,
                    )

        self.assertEqual(1, len(self.rows("SELECT * FROM allowance_rules")))
        self.assertEqual(1, self.store.snapshot()["revision"])


class TestClaim(PiggyServiceTestCase):
    def test_thirty_dollar_claim_fills_active_and_records_one_revision(self):
        self.service.initialize(self.now)
        rule_id = self.service.set_allowance(
            30,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        result = self.service.claim("2026-09-21", self.now)

        pig = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        claim = self.rows("SELECT * FROM claims")[0]
        ledger = self.rows("SELECT * FROM ledger")[0]
        self.assertEqual((30, 150), (pig["value"], pig["capacity"]))
        self.assertEqual(
            (rule_id, "2026-09-21", 30, "on_time"),
            (
                claim["rule_id"],
                claim["period_key"],
                claim["amount"],
                claim["claim_kind"],
            ),
        )
        self.assertEqual(
            ("allowance_claim", 30, 30, "今日零用錢", 3),
            (
                ledger["kind"],
                ledger["amount"],
                ledger["balance_after"],
                ledger["note"],
                ledger["revision"],
            ),
        )
        self.assertEqual(
            {
                "period_key": "2026-09-21",
                "claim_kind": "on_time",
                "rule_id": rule_id,
            },
            json.loads(ledger["metadata"]),
        )
        self.assertEqual(
            {
                "revision": 3,
                "period_key": "2026-09-21",
                "amount": 30,
                "claim_kind": "on_time",
            },
            result,
        )
        self.assertEqual(3, self.store.snapshot()["revision"])

    def test_claiming_same_period_twice_is_not_claimable_and_changes_nothing(self):
        self.service.initialize(self.now)
        self.service.set_allowance(
            30,
            "daily",
            date(2026, 9, 21),
            self.now,
        )
        self.service.claim("2026-09-21", self.now)
        before = {
            "revision": self.store.snapshot()["revision"],
            "claims": [tuple(row) for row in self.rows("SELECT * FROM claims")],
            "pigs": [tuple(row) for row in self.rows("SELECT * FROM pigs")],
            "ledger": [tuple(row) for row in self.rows("SELECT * FROM ledger")],
        }

        with self.assertRaises(DomainError) as raised:
            self.service.claim("2026-09-21", self.now)

        self.assertEqual("not_claimable", raised.exception.code)
        self.assertEqual("這一期不能領取", str(raised.exception))
        self.assertEqual(before["revision"], self.store.snapshot()["revision"])
        self.assertEqual(
            before["claims"],
            [tuple(row) for row in self.rows("SELECT * FROM claims")],
        )
        self.assertEqual(
            before["pigs"],
            [tuple(row) for row in self.rows("SELECT * FROM pigs")],
        )
        self.assertEqual(
            before["ledger"],
            [tuple(row) for row in self.rows("SELECT * FROM ledger")],
        )


class TestPigFilling(PiggyServiceTestCase):
    def test_claims_stack_into_the_same_pig(self):
        first_day = datetime(2026, 9, 20, 19, 0, tzinfo=TAIPEI)
        self.service.initialize(first_day)
        self.service.set_allowance(
            140,
            "daily",
            date(2026, 9, 20),
            first_day,
        )
        self.service.claim("2026-09-20", first_day)
        self.service.set_allowance(
            30,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        self.service.claim("2026-09-21", self.now)

        pigs = self.rows("SELECT * FROM pigs WHERE status='growing'")
        self.assertEqual(1, len(pigs))
        self.assertEqual(170, pigs[0]["value"])
        self.assertEqual(first_day.isoformat(), pigs[0]["last_yield_date"])
        self.assertIsNone(pigs[0]["page_no"])
        self.assertEqual([], self.rows("SELECT * FROM pigs WHERE status='full'"))

    def test_large_claim_stays_on_the_same_pig(self):
        self.service.initialize(self.now)
        self.service.set_allowance(
            470,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        self.service.claim("2026-09-21", self.now)

        pigs = self.rows("SELECT * FROM pigs WHERE status='growing'")
        self.assertEqual(1, len(pigs))
        self.assertEqual(470, pigs[0]["value"])
        self.assertEqual(self.now.isoformat(), pigs[0]["last_yield_date"])


class TestWarehouseAndState(PiggyServiceTestCase):
    def test_initialize_collapses_old_warehouse_pigs_into_one(self):
        first_day = datetime(2026, 9, 20, 19, 0, tzinfo=TAIPEI)
        self.service.initialize(first_day)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='growing'")[0]["id"]
        extra = "full-pig-1"
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                INSERT INTO pigs (
                  id, tier_id, status, capacity, value, hit_count,
                  daily_yield, yield_cap, pending_yield, page_no, slot_no,
                  created_at
                )
                VALUES (?, 'basic-150', 'full', 150, 150, 5, 1, 3, 1, 1, 1, ?)
                """,
                (extra, first_day.isoformat()),
            )
            conn.commit()
        finally:
            conn.close()

        self.service.initialize(self.now)

        pigs = self.rows("SELECT * FROM pigs WHERE status='growing'")
        broken = self.rows("SELECT * FROM pigs WHERE status='broken'")
        self.assertEqual(1, len(pigs))
        self.assertEqual(pig_id, pigs[0]["id"])
        self.assertEqual(150, pigs[0]["value"])
        self.assertEqual(0, pigs[0]["pending_yield"])
        self.assertIsNone(pigs[0]["page_no"])
        self.assertEqual([extra], [row["id"] for row in broken])

    def test_state_reports_total_one_pig_and_claimable_periods(self):
        first_day = datetime(2026, 9, 20, 19, 0, tzinfo=TAIPEI)
        self.service.initialize(first_day)
        self.service.set_allowance(
            80,
            "daily",
            date(2026, 9, 20),
            first_day,
        )
        self.service.claim("2026-09-20", first_day)
        next_rule = self.service.set_allowance(
            25,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        state = self.service.state(self.now)

        self.assertEqual("melody", state["theme"])
        self.assertEqual(80, state["total"])
        self.assertEqual("growing", state["active_pig"]["status"])
        self.assertEqual(80, state["active_pig"]["value"])
        self.assertNotIn("warehouse_pages", state)
        starter_id = self.rows(
            "SELECT id FROM allowance_rules ORDER BY effective_date, id"
        )[0]["id"]
        self.assertEqual(
            [
                {
                    "period_key": f"2026-09-{day:02d}",
                    "rule_id": starter_id,
                    "amount": 30,
                    "due_date": date(2026, 9, day),
                    "claim_kind": "makeup",
                }
                for day in range(14, 20)
            ]
            + [
                {
                    "period_key": "2026-09-21",
                    "rule_id": next_rule,
                    "amount": 25,
                    "due_date": date(2026, 9, 21),
                    "claim_kind": "on_time",
                }
            ],
            state["claimable_periods"],
        )
        self.assertEqual(
            due_at(date(2026, 9, 22)).isoformat(),
            state["next_allowance_at"],
        )


class TestDebugFeed(PiggyServiceTestCase):
    def test_debug_feed_queues_ten_unclaimed_days_for_the_normal_claim(self):
        self.service.initialize(self.now)
        before = self.service.state(self.now)
        self.assertEqual(0, before["total"])

        result = self.service.debug_feed(self.now)
        after = self.service.state(self.now)

        self.assertEqual(10, result["queued_days"])
        self.assertEqual(30, result["amount"])
        self.assertEqual(
            len(before["claimable_periods"]) + 10,
            len(after["claimable_periods"]),
        )
        self.assertEqual(0, after["total"])
        self.assertEqual([], self.rows("SELECT kind FROM ledger"))
        first = after["claimable_periods"][0]
        claimed = self.service.claim(first["period_key"], self.now)
        self.assertEqual(first["amount"], claimed["amount"])
        self.assertEqual(first["amount"], self.service.state(self.now)["total"])

    def test_debug_feed_can_queue_another_ten_days(self):
        self.service.initialize(self.now)
        self.service.debug_feed(self.now)
        midway = self.service.state(self.now)

        result = self.service.debug_feed(self.now)
        after = self.service.state(self.now)

        self.assertEqual(10, result["queued_days"])
        self.assertEqual(
            len(midway["claimable_periods"]) + 10,
            len(after["claimable_periods"]),
        )
        self.assertEqual(0, after["total"])


if __name__ == "__main__":
    unittest.main()
