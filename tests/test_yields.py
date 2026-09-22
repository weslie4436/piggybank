"""Interest is retired until a later version."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")
START = datetime(2026, 9, 21, 19, 0, tzinfo=TAIPEI)


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


class TestInterestRetired(YieldTestCase):
    def test_balance_does_not_grow_overnight(self):
        self.claim(150)
        later = self.service.state(START + timedelta(days=4))
        pig = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        self.assertEqual(150, later["total"])
        self.assertEqual(0, later["active_pig"]["pending_yield"])
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(150, pig["value"])

    def test_leftover_pending_yield_is_cleared_without_paying_it(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='growing'")[0]["id"]
        self.execute(
            "UPDATE pigs SET pending_yield=3 WHERE id=?",
            (pig_id,),
        )

        result = self.service.accrue(START + timedelta(days=1))
        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertTrue(result["changed"])
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(150, pig["value"])

    def test_harvest_is_rejected_and_does_not_change_the_balance(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='growing'")[0]["id"]
        self.execute(
            "UPDATE pigs SET pending_yield=3 WHERE id=?",
            (pig_id,),
        )
        revision = self.store.snapshot()["revision"]

        with self.assertRaises(DomainError) as harvested:
            self.service.harvest_pig(pig_id, START + timedelta(days=1))
        self.assertEqual("nothing_to_harvest", harvested.exception.code)

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(150, pig["value"])
        self.assertEqual(
            ["allowance_claim"],
            [row["kind"] for row in self.rows("SELECT kind FROM ledger")],
        )
        self.assertGreaterEqual(self.store.snapshot()["revision"], revision)

    def test_all_service_now_arguments_reject_naive_datetimes(self):
        self.claim(150)
        pig_id = self.rows("SELECT id FROM pigs WHERE status='growing'")[0]["id"]
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
