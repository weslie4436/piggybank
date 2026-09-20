"""Tests for pig yield and complete-page bonus accounting."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")
START = datetime(2026, 9, 21, 8, 0, tzinfo=TAIPEI)


class YieldTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.service = PiggyService(self.store)
        self.service.initialize(START)

    def tearDown(self):
        self.tmp.cleanup()

    def rows(self, query: str, parameters: tuple = ()) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(query, parameters).fetchall()
        finally:
            conn.close()

    def execute(self, query: str, parameters: tuple = ()) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(query, parameters)
            conn.commit()
        finally:
            conn.close()

    def claim(self, amount: int, now: datetime = START) -> None:
        self.service.set_allowance(amount, "daily", now.date(), now)
        self.service.claim(now.date().isoformat(), now)


class TestPigAccrual(YieldTestCase):
    def test_full_pig_accrues_only_after_complete_24_hours(self):
        self.claim(150)
        revision = self.store.snapshot()["revision"]

        before_period = self.service.accrue(
            START + timedelta(hours=23, minutes=59)
        )
        pig = self.rows("SELECT * FROM pigs WHERE status='full'")[0]
        self.assertEqual(
            {"revision": revision, "changed": False},
            before_period,
        )
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(START.isoformat(), pig["last_yield_date"])

        at_period = self.service.accrue(START + timedelta(hours=24))
        pig = self.rows("SELECT * FROM pigs WHERE status='full'")[0]
        self.assertEqual(
            {"revision": revision + 1, "changed": True},
            at_period,
        )
        self.assertEqual(1, pig["pending_yield"])
        self.assertEqual(
            (START + timedelta(days=1)).isoformat(),
            pig["last_yield_date"],
        )

    def test_offline_cap_still_advances_cursor_all_elapsed_periods(self):
        self.claim(150)

        first = self.service.accrue(START + timedelta(days=4))
        pig = self.rows("SELECT * FROM pigs WHERE status='full'")[0]
        self.assertTrue(first["changed"])
        self.assertEqual(3, pig["pending_yield"])
        self.assertEqual(
            (START + timedelta(days=4)).isoformat(),
            pig["last_yield_date"],
        )

        repeated = self.service.accrue(START + timedelta(days=4))
        self.assertEqual(
            {"revision": first["revision"], "changed": False},
            repeated,
        )

    def test_reserved_accrues_but_growing_and_broken_do_not(self):
        self.claim(150)
        reserved_id = self.rows(
            "SELECT id FROM pigs WHERE status='full'"
        )[0]["id"]
        growing_id = self.rows(
            "SELECT id FROM pigs WHERE status='growing'"
        )[0]["id"]
        broken_id = uuid4().hex
        self.execute(
            """
            UPDATE pigs
            SET status='reserved', reserved_exchange_id='exchange-1'
            WHERE id=?
            """,
            (reserved_id,),
        )
        self.execute(
            "UPDATE pigs SET last_yield_date=? WHERE id=?",
            (START.isoformat(), growing_id),
        )
        self.execute(
            """
            INSERT INTO pigs (
              id, tier_id, status, capacity, value, hit_count,
              daily_yield, yield_cap, last_yield_date, created_at
            )
            VALUES (?, 'basic-150', 'broken', 150, 150, 5, 1, 3, ?, ?)
            """,
            (broken_id, START.isoformat(), START.isoformat()),
        )

        self.service.accrue(START + timedelta(days=1))

        pigs = {
            row["id"]: row
            for row in self.rows(
                "SELECT id, pending_yield, last_yield_date FROM pigs"
            )
        }
        self.assertEqual(1, pigs[reserved_id]["pending_yield"])
        self.assertEqual(
            (START + timedelta(days=1)).isoformat(),
            pigs[reserved_id]["last_yield_date"],
        )
        self.assertEqual(0, pigs[growing_id]["pending_yield"])
        self.assertEqual(START.isoformat(), pigs[growing_id]["last_yield_date"])
        self.assertEqual(0, pigs[broken_id]["pending_yield"])
        self.assertEqual(START.isoformat(), pigs[broken_id]["last_yield_date"])


class TestPigHarvest(YieldTestCase):
    def test_harvest_accrues_into_original_pig_and_records_one_revision(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='full'")[0]["id"]

        result = self.service.harvest_pig(
            pig_id,
            START + timedelta(days=1),
        )

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        ledger = self.rows("SELECT * FROM ledger ORDER BY revision DESC")[0]
        self.assertEqual((151, 0), (pig["value"], pig["pending_yield"]))
        self.assertEqual(
            {
                "revision": 4,
                "pig_id": pig_id,
                "amount": 1,
                "value": 151,
                "total": 151,
            },
            result,
        )
        self.assertEqual(
            ("pig_yield_harvest", 1, 151, "撲滿收益", 4),
            (
                ledger["kind"],
                ledger["amount"],
                ledger["balance_after"],
                ledger["note"],
                ledger["revision"],
            ),
        )
        self.assertEqual({"pig_id": pig_id}, json.loads(ledger["metadata"]))
        self.assertEqual(
            (START + timedelta(days=1)).isoformat(),
            ledger["created_at"],
        )

    def test_harvest_after_cap_does_not_refill_blocked_history(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='full'")[0]["id"]

        harvested = self.service.harvest_pig(
            pig_id,
            START + timedelta(days=4),
        )
        after_minute = self.service.accrue(
            START + timedelta(days=4, minutes=1)
        )

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual(3, harvested["amount"])
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(
            (START + timedelta(days=4)).isoformat(),
            pig["last_yield_date"],
        )
        self.assertEqual(
            {"revision": harvested["revision"], "changed": False},
            after_minute,
        )

    def test_empty_and_reserved_pigs_are_rejected_without_changes(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='full'")[0]["id"]
        revision = self.store.snapshot()["revision"]

        with self.assertRaises(DomainError) as empty:
            self.service.harvest_pig(pig_id, START)
        self.assertEqual("nothing_to_harvest", empty.exception.code)
        self.assertEqual("目前沒有可收的收益", str(empty.exception))

        self.execute(
            """
            UPDATE pigs
            SET status='reserved', reserved_exchange_id='exchange-1'
            WHERE id=?
            """,
            (pig_id,),
        )
        with self.assertRaises(DomainError) as reserved:
            self.service.harvest_pig(
                pig_id,
                START + timedelta(days=1),
            )
        self.assertEqual("pig_reserved", reserved.exception.code)
        self.assertEqual("這隻撲滿正在兌換中", str(reserved.exception))

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(START.isoformat(), pig["last_yield_date"])
        self.assertEqual(revision, self.store.snapshot()["revision"])
        self.assertEqual(
            ["allowance_claim"],
            [row["kind"] for row in self.rows("SELECT kind FROM ledger")],
        )


class TestPageAccrual(YieldTestCase):
    def test_complete_page_accrues_two_daily_and_caps_at_six(self):
        self.claim(900)

        self.service.accrue(START + timedelta(hours=23, minutes=59))
        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(0, page["pending_bonus"])
        self.assertEqual(START.isoformat(), page["last_bonus_date"])

        self.service.accrue(START + timedelta(days=1))
        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(2, page["pending_bonus"])
        self.assertEqual(
            (START + timedelta(days=1)).isoformat(),
            page["last_bonus_date"],
        )

        self.service.accrue(START + timedelta(days=4))
        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(6, page["pending_bonus"])
        self.assertEqual(
            (START + timedelta(days=4)).isoformat(),
            page["last_bonus_date"],
        )

    def test_incomplete_page_preserves_bonus_without_accruing_more(self):
        self.claim(900)
        self.service.accrue(START + timedelta(days=1))
        removed_id = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=1 AND slot_no=2
            """
        )[0]["id"]
        self.execute(
            """
            UPDATE pigs
            SET status='broken', page_no=NULL, slot_no=NULL
            WHERE id=?
            """,
            (removed_id,),
        )
        self.execute(
            """
            UPDATE warehouse_pages
            SET complete_since=NULL
            WHERE page_no=1
            """
        )

        self.service.accrue(START + timedelta(days=3))

        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(2, page["pending_bonus"])
        self.assertIsNone(page["complete_since"])
        self.assertEqual(
            (START + timedelta(days=1)).isoformat(),
            page["last_bonus_date"],
        )

    def test_refilled_page_waits_a_new_complete_24_hours(self):
        self.claim(900)
        self.service.accrue(START + timedelta(days=1))
        removed_id = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=1 AND slot_no=2
            """
        )[0]["id"]
        self.execute(
            """
            UPDATE pigs
            SET status='broken', page_no=NULL, slot_no=NULL
            WHERE id=?
            """,
            (removed_id,),
        )
        self.execute(
            """
            UPDATE warehouse_pages
            SET complete_since=NULL
            WHERE page_no=1
            """
        )
        refill_at = START + timedelta(days=2)
        self.claim(150, refill_at)
        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(refill_at.isoformat(), page["complete_since"])
        self.assertEqual(refill_at.isoformat(), page["last_bonus_date"])
        self.assertEqual(2, page["pending_bonus"])

        self.service.accrue(
            refill_at + timedelta(hours=23, minutes=59)
        )
        before_period = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(2, before_period["pending_bonus"])
        self.assertEqual(
            refill_at.isoformat(),
            before_period["last_bonus_date"],
        )

        self.service.accrue(refill_at + timedelta(days=1))
        after_period = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(4, after_period["pending_bonus"])
        self.assertEqual(
            (refill_at + timedelta(days=1)).isoformat(),
            after_period["last_bonus_date"],
        )


class TestPageHarvest(YieldTestCase):
    def test_missing_and_empty_pages_are_rejected_without_changes(self):
        revision = self.store.snapshot()["revision"]

        with self.assertRaises(DomainError) as missing:
            self.service.harvest_page(99, START)
        self.assertEqual("page_not_found", missing.exception.code)
        self.assertEqual("找不到這一頁倉庫", str(missing.exception))

        with self.assertRaises(DomainError) as empty:
            self.service.harvest_page(1, START)
        self.assertEqual("nothing_to_harvest", empty.exception.code)
        self.assertEqual("目前沒有可收的收益", str(empty.exception))
        self.assertEqual(revision, self.store.snapshot()["revision"])

    def test_incomplete_page_can_harvest_bonus_already_earned(self):
        self.claim(900)
        earned_at = START + timedelta(days=1)
        self.service.accrue(earned_at)
        removed_id = self.rows(
            """
            SELECT id FROM pigs
            WHERE page_no=1 AND slot_no=2
            """
        )[0]["id"]
        self.execute(
            """
            UPDATE pigs
            SET status='broken', page_no=NULL, slot_no=NULL
            WHERE id=?
            """,
            (removed_id,),
        )
        self.execute(
            """
            UPDATE warehouse_pages
            SET complete_since=NULL
            WHERE page_no=1
            """
        )

        result = self.service.harvest_page(1, earned_at)

        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        active = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        self.assertEqual(2, result["amount"])
        self.assertEqual(0, page["pending_bonus"])
        self.assertEqual(2, active["value"])

    def test_page_harvest_feeds_across_capacity_and_completes_next_page(self):
        self.claim(1799)
        active_id = self.rows(
            "SELECT id FROM pigs WHERE status='growing'"
        )[0]["id"]

        result = self.service.harvest_page(
            1,
            START + timedelta(days=3),
        )

        stored_active = self.rows(
            "SELECT * FROM pigs WHERE id=?",
            (active_id,),
        )[0]
        new_active = self.rows(
            "SELECT * FROM pigs WHERE status='growing'"
        )[0]
        pages = self.rows(
            "SELECT * FROM warehouse_pages ORDER BY page_no"
        )
        page1 = pages[0]
        page2 = pages[1]
        ledger = self.rows("SELECT * FROM ledger ORDER BY revision DESC")[0]
        self.assertEqual(
            {
                "revision": 4,
                "page_no": 1,
                "amount": 6,
                "total": 1805,
            },
            result,
        )
        self.assertEqual(
            ("full", 150, 2, 6),
            (
                stored_active["status"],
                stored_active["value"],
                stored_active["page_no"],
                stored_active["slot_no"],
            ),
        )
        self.assertEqual(5, new_active["value"])
        self.assertEqual([1, 2, 3], [page["page_no"] for page in pages])
        self.assertEqual(0, page1["pending_bonus"])
        self.assertEqual(
            (START + timedelta(days=3)).isoformat(),
            page2["complete_since"],
        )
        self.assertEqual(
            ("page_bonus_harvest", 6, 1805, "整頁儲蓄收益", 4),
            (
                ledger["kind"],
                ledger["amount"],
                ledger["balance_after"],
                ledger["note"],
                ledger["revision"],
            ),
        )
        self.assertEqual({"page_no": 1}, json.loads(ledger["metadata"]))


class TestStateAndTimeValidation(YieldTestCase):
    def test_state_accrues_before_snapshot_and_same_time_is_idempotent(self):
        self.claim(150)
        now = START + timedelta(days=1)

        first = self.service.state(now)
        second = self.service.state(now)

        pig_id = self.rows("SELECT id FROM pigs WHERE status='full'")[0]["id"]
        first_pig = first["warehouse_pages"][0]["pigs"][0]
        second_pig = second["warehouse_pages"][0]["pigs"][0]
        self.assertEqual(pig_id, first_pig["id"])
        self.assertEqual(1, first_pig["pending_yield"])
        self.assertEqual(4, first["revision"])
        self.assertEqual(150, first["total"])
        self.assertEqual(first["revision"], second["revision"])
        self.assertEqual(1, second_pig["pending_yield"])

    def test_all_service_now_arguments_reject_naive_datetimes(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='full'")[0]["id"]
        naive = START.replace(tzinfo=None)
        revision = self.store.snapshot()["revision"]
        calls = (
            ("initialize", lambda: self.service.initialize(naive)),
            (
                "set_allowance",
                lambda: self.service.set_allowance(
                    10,
                    "daily",
                    START.date(),
                    naive,
                ),
            ),
            ("state", lambda: self.service.state(naive)),
            (
                "claim",
                lambda: self.service.claim(START.date().isoformat(), naive),
            ),
            ("accrue", lambda: self.service.accrue(naive)),
            (
                "harvest_pig",
                lambda: self.service.harvest_pig(pig_id, naive),
            ),
            (
                "harvest_page",
                lambda: self.service.harvest_page(1, naive),
            ),
        )

        for name, call in calls:
            with self.subTest(method=name):
                with self.assertRaisesRegex(
                    ValueError,
                    "now must be timezone-aware",
                ):
                    call()

        self.assertEqual(revision, self.store.snapshot()["revision"])


if __name__ == "__main__":
    unittest.main()
