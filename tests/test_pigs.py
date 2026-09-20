"""Tests for transactional allowance and pig filling behavior."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")


class PiggyServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.service = PiggyService(self.store)
        self.now = datetime(2026, 9, 21, 8, 0, tzinfo=TAIPEI)

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
    def test_initialize_creates_one_active_pig_and_page_once(self):
        self.service.initialize(self.now)
        self.service.initialize(self.now)

        pages = self.rows("SELECT * FROM warehouse_pages ORDER BY page_no")
        pigs = self.rows("SELECT * FROM pigs ORDER BY created_at, id")
        self.assertEqual([1], [row["page_no"] for row in pages])
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
        self.assertEqual(1, self.store.snapshot()["revision"])

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
        self.assertEqual([daily_id, weekly_id, monthly_id], [row["id"] for row in rules])
        self.assertEqual(
            [
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

        self.assertEqual([], self.rows("SELECT * FROM allowance_rules"))
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
            ("allowance_claim", 30, 30, "今日零用金", 3),
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
    def test_one_hundred_forty_then_thirty_stores_full_pig_and_carries_twenty(self):
        first_day = datetime(2026, 9, 20, 8, 0, tzinfo=TAIPEI)
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

        full = self.rows("SELECT * FROM pigs WHERE status='full'")[0]
        active = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        self.assertEqual((150, 1, 1), (full["value"], full["page_no"], full["slot_no"]))
        self.assertEqual(self.now.isoformat(), full["filled_at"])
        self.assertEqual(self.now.isoformat(), full["last_yield_date"])
        self.assertEqual(20, active["value"])
        self.assertEqual(170, sum(row["value"] for row in (full, active)))

    def test_large_claim_can_fill_multiple_pigs(self):
        self.service.initialize(self.now)
        self.service.set_allowance(
            470,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        self.service.claim("2026-09-21", self.now)

        full = self.rows(
            """
            SELECT * FROM pigs
            WHERE status='full'
            ORDER BY page_no, slot_no
            """
        )
        active = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        self.assertEqual([150, 150, 150], [row["value"] for row in full])
        self.assertEqual([1, 2, 3], [row["slot_no"] for row in full])
        self.assertEqual(20, active["value"])

    def test_sixth_full_pig_completes_page_and_unlocks_next_page(self):
        self.service.initialize(self.now)
        self.service.set_allowance(
            900,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        self.service.claim("2026-09-21", self.now)

        full = self.rows(
            """
            SELECT * FROM pigs
            WHERE status='full'
            ORDER BY page_no, slot_no
            """
        )
        pages = self.rows("SELECT * FROM warehouse_pages ORDER BY page_no")
        active = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        self.assertEqual([1, 2, 3, 4, 5, 6], [row["slot_no"] for row in full])
        self.assertTrue(all(row["page_no"] == 1 for row in full))
        self.assertEqual([1, 2], [row["page_no"] for row in pages])
        self.assertEqual(self.now.isoformat(), pages[0]["complete_since"])
        self.assertEqual(self.now.isoformat(), pages[0]["last_bonus_date"])
        self.assertIsNone(pages[1]["complete_since"])
        self.assertEqual(0, active["value"])


class TestWarehouseAndState(PiggyServiceTestCase):
    def test_new_full_pig_fills_earliest_hole_without_moving_later_page_pig(self):
        first_day = datetime(2026, 9, 20, 8, 0, tzinfo=TAIPEI)
        self.service.initialize(first_day)
        self.service.set_allowance(
            1050,
            "daily",
            date(2026, 9, 20),
            first_day,
        )
        self.service.claim("2026-09-20", first_day)
        removed = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=1 AND slot_no=2 AND status='full'
            """
        )[0]["id"]
        later = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=2 AND slot_no=1 AND status='full'
            """
        )[0]["id"]
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                UPDATE pigs
                SET status='broken', page_no=NULL, slot_no=NULL
                WHERE id=?
                """,
                (removed,),
            )
            conn.execute(
                """
                UPDATE warehouse_pages
                SET complete_since=NULL, last_bonus_date=NULL
                WHERE page_no=1
                """
            )
            conn.commit()
        finally:
            conn.close()
        self.service.set_allowance(
            150,
            "daily",
            date(2026, 9, 21),
            self.now,
        )

        self.service.claim("2026-09-21", self.now)

        replacement = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=1 AND slot_no=2 AND status='full'
            """
        )[0]["id"]
        later_after = self.rows(
            "SELECT page_no, slot_no FROM pigs WHERE id=?",
            (later,),
        )[0]
        page1 = self.rows(
            "SELECT complete_since, last_bonus_date FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertNotEqual(removed, replacement)
        self.assertEqual((2, 1), (later_after["page_no"], later_after["slot_no"]))
        self.assertEqual(self.now.isoformat(), page1["complete_since"])
        self.assertEqual(self.now.isoformat(), page1["last_bonus_date"])

    def test_state_reports_total_sorted_pages_pigs_and_claimable_periods(self):
        first_day = datetime(2026, 9, 20, 8, 0, tzinfo=TAIPEI)
        self.service.initialize(first_day)
        self.service.set_allowance(
            1050,
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

        self.assertEqual(5, state["revision"])
        self.assertEqual(1050, state["total"])
        self.assertEqual("growing", state["active_pig"]["status"])
        self.assertEqual(0, state["active_pig"]["value"])
        self.assertEqual([1, 2], [page["page_no"] for page in state["warehouse_pages"]])
        self.assertEqual(
            [True, False],
            [page["complete"] for page in state["warehouse_pages"]],
        )
        self.assertEqual(
            [1, 2, 3, 4, 5, 6],
            [pig["slot_no"] for pig in state["warehouse_pages"][0]["pigs"]],
        )
        self.assertEqual(
            [1],
            [pig["slot_no"] for pig in state["warehouse_pages"][1]["pigs"]],
        )
        self.assertEqual(
            [
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


if __name__ == "__main__":
    unittest.main()
