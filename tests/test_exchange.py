"""Tests for exchange reservation, parent approval, and spending."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from piggybank.auth import token_hash, verify_pin
from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")
START = datetime(2026, 9, 21, 8, 0, tzinfo=TAIPEI)


class ExchangeTestCase(unittest.TestCase):
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

    def full_pigs(self) -> list[sqlite3.Row]:
        return self.rows(
            """
            SELECT * FROM pigs
            WHERE status='full'
            ORDER BY page_no, slot_no
            """
        )

    def assert_domain_error(self, code: str, call) -> DomainError:
        with self.assertRaises(DomainError) as raised:
            call()
        self.assertEqual(code, raised.exception.code)
        return raised.exception


class TestParentPin(ExchangeTestCase):
    def test_set_parent_pin_hashes_value_and_bumps_once(self):
        before = self.store.snapshot()["revision"]

        result = self.service.set_parent_pin("123456", START)

        stored = self.rows(
            "SELECT value FROM settings WHERE key='parent_pin_hash'"
        )[0]["value"]
        self.assertNotEqual("123456", stored)
        self.assertTrue(verify_pin("123456", stored))
        self.assertEqual({"revision": before + 1}, result)
        self.assertEqual(before + 1, self.store.snapshot()["revision"])


class TestPreviewExchange(ExchangeTestCase):
    def test_preview_reports_exact_values_hits_and_complete_page_risk(self):
        self.claim(900)
        pigs = self.full_pigs()
        selected = [pigs[1]["id"], pigs[0]["id"]]
        before_revision = self.store.snapshot()["revision"]
        before_rows = [tuple(row) for row in self.rows("SELECT * FROM pigs")]

        result = self.service.preview_exchange(250, selected, START)

        self.assertEqual(
            {
                "requested_amount": 250,
                "total_pig_value": 300,
                "change_amount": 50,
                "pig_ids": selected,
                "pigs": [
                    {
                        "id": pigs[1]["id"],
                        "value": 150,
                        "hit_count": 5,
                        "page_no": 1,
                        "slot_no": 2,
                    },
                    {
                        "id": pigs[0]["id"],
                        "value": 150,
                        "hit_count": 5,
                        "page_no": 1,
                        "slot_no": 1,
                    },
                ],
                "bonus_pages_at_risk": [1],
            },
            result,
        )
        self.assertEqual(before_revision, self.store.snapshot()["revision"])
        self.assertEqual(
            before_rows,
            [tuple(row) for row in self.rows("SELECT * FROM pigs")],
        )

    def test_preview_rejects_invalid_amount_empty_and_duplicate_ids(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        invalid_calls = (
            lambda: self.service.preview_exchange(0, [pig_id], START),
            lambda: self.service.preview_exchange(-1, [pig_id], START),
            lambda: self.service.preview_exchange(1.5, [pig_id], START),
            lambda: self.service.preview_exchange(True, [pig_id], START),
            lambda: self.service.preview_exchange(1, [], START),
            lambda: self.service.preview_exchange(1, [pig_id, pig_id], START),
        )

        for call in invalid_calls:
            with self.subTest(call=call):
                with self.assertRaises(ValueError):
                    call()

    def test_preview_rejects_missing_and_growing_pigs(self):
        self.claim(150)
        growing_id = self.rows(
            "SELECT id FROM pigs WHERE status='growing'"
        )[0]["id"]

        self.assert_domain_error(
            "pig_not_breakable",
            lambda: self.service.preview_exchange(1, ["missing"], START),
        )
        self.assert_domain_error(
            "pig_not_breakable",
            lambda: self.service.preview_exchange(1, [growing_id], START),
        )

    def test_preview_rejects_reserved_pig(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        self.execute(
            """
            UPDATE pigs
            SET status='reserved', reserved_exchange_id='other-exchange'
            WHERE id=?
            """,
            (pig_id,),
        )

        self.assert_domain_error(
            "pig_reserved",
            lambda: self.service.preview_exchange(1, [pig_id], START),
        )

    def test_preview_is_strictly_read_only_even_when_accrual_is_due(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        before_revision = self.store.snapshot()["revision"]
        before_database = self.db_path.read_bytes()
        before_pigs = [
            tuple(row)
            for row in self.rows("SELECT * FROM pigs ORDER BY id")
        ]

        result = self.service.preview_exchange(
            1,
            [pig_id],
            START + timedelta(days=1),
        )

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual(149, result["change_amount"])
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(before_revision, self.store.snapshot()["revision"])
        self.assertEqual(
            before_pigs,
            [
                tuple(row)
                for row in self.rows("SELECT * FROM pigs ORDER BY id")
            ],
        )
        self.assertEqual(before_database, self.db_path.read_bytes())

    def test_preview_rejects_insufficient_selected_value(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]

        self.assert_domain_error(
            "insufficient_pigs",
            lambda: self.service.preview_exchange(151, [pig_id], START),
        )


class TestReserveExchange(ExchangeTestCase):
    def test_reserve_uses_stored_rows_without_running_accrual(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        before = self.store.snapshot()["revision"]

        result = self.service.reserve_exchange(
            1,
            "隔日預約",
            [pig_id],
            START + timedelta(days=1),
        )

        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual("reserved", pig["status"])
        self.assertEqual(0, pig["pending_yield"])
        self.assertEqual(before + 1, result["revision"])

    def test_reserve_revalidates_if_pig_changes_after_its_own_preview(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        original_preview = self.service.preview_exchange
        before = self.store.snapshot()["revision"]

        def preview_then_reserve(
            amount: int,
            pig_ids: list[str],
            now: datetime,
        ) -> dict:
            result = original_preview(amount, pig_ids, now)
            with self.store.transaction() as conn:
                conn.execute(
                    """
                    UPDATE pigs
                    SET status='reserved',
                        reserved_exchange_id='fake-reservation'
                    WHERE id=?
                    """,
                    (pig_id,),
                )
            return result

        with patch.object(
            self.service,
            "preview_exchange",
            side_effect=preview_then_reserve,
        ):
            self.assert_domain_error(
                "pig_reserved",
                lambda: self.service.reserve_exchange(
                    1,
                    "競態測試",
                    [pig_id],
                    START,
                ),
            )

        exchanges = self.rows("SELECT id FROM exchanges")
        pig = self.rows("SELECT * FROM pigs WHERE id=?", (pig_id,))[0]
        self.assertEqual([], exchanges)
        self.assertEqual(
            ("reserved", "fake-reservation"),
            (pig["status"], pig["reserved_exchange_id"]),
        )
        self.assertEqual(before, self.store.snapshot()["revision"])

    def test_reserve_stores_only_token_hash_and_preserves_complete_page(self):
        self.claim(900)
        pigs = self.full_pigs()
        selected = [pigs[2]["id"], pigs[0]["id"]]
        page_before = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        ledger_before = len(self.rows("SELECT * FROM ledger"))
        revision_before = self.store.snapshot()["revision"]

        result = self.service.reserve_exchange(
            200,
            "  買文具  ",
            selected,
            START,
        )

        exchange = self.rows("SELECT * FROM exchanges")[0]
        reserved = self.rows(
            """
            SELECT * FROM pigs
            WHERE reserved_exchange_id=?
            ORDER BY slot_no
            """,
            (exchange["id"],),
        )
        page_after = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        self.assertEqual(token_hash(result["token"]), exchange["token_hash"])
        self.assertNotIn(
            result["token"].encode("utf-8"),
            self.db_path.read_bytes(),
        )
        self.assertEqual("買文具", exchange["child_note"])
        self.assertEqual(
            json.dumps(selected, ensure_ascii=False, separators=(",", ":")),
            exchange["pig_ids"],
        )
        self.assertEqual(
            (300, 100, (START + timedelta(minutes=15)).isoformat()),
            (
                exchange["total_pig_value"],
                exchange["change_amount"],
                exchange["expires_at"],
            ),
        )
        self.assertEqual(
            [("reserved", 150, 1, 1), ("reserved", 150, 1, 3)],
            [
                (row["status"], row["value"], row["page_no"], row["slot_no"])
                for row in reserved
            ],
        )
        self.assertEqual(
            (
                page_before["complete_since"],
                page_before["last_bonus_date"],
                page_before["pending_bonus"],
            ),
            (
                page_after["complete_since"],
                page_after["last_bonus_date"],
                page_after["pending_bonus"],
            ),
        )
        self.assertEqual(ledger_before, len(self.rows("SELECT * FROM ledger")))
        self.assertEqual(revision_before + 1, result["revision"])
        self.assertEqual(
            {
                "id": exchange["id"],
                "expires_at": (START + timedelta(minutes=15)).isoformat(),
                "requested_amount": 200,
                "total_pig_value": 300,
                "change_amount": 100,
                "pig_ids": selected,
                "bonus_pages_at_risk": [1],
            },
            {
                key: result[key]
                for key in (
                    "id",
                    "expires_at",
                    "requested_amount",
                    "total_pig_value",
                    "change_amount",
                    "pig_ids",
                    "bonus_pages_at_risk",
                )
            },
        )

    def test_reserve_validates_trimmed_child_note_without_changes(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        before = self.store.snapshot()["revision"]

        for note in ("", "   ", "x" * 81):
            with self.subTest(note=note):
                with self.assertRaises(ValueError):
                    self.service.reserve_exchange(1, note, [pig_id], START)

        self.assertEqual([], self.rows("SELECT * FROM exchanges"))
        self.assertEqual(before, self.store.snapshot()["revision"])


class TestApproveExchange(ExchangeTestCase):
    def prepare(self, amount: int = 1000) -> tuple[dict, list[sqlite3.Row]]:
        self.claim(amount)
        self.service.set_parent_pin("123456", START)
        pigs = self.full_pigs()
        selected = (
            [pigs[1]["id"], pigs[3]["id"]]
            if len(pigs) >= 4
            else [pigs[0]["id"], pigs[1]["id"]]
        )
        reservation = self.service.reserve_exchange(
            200,
            "買文具",
            selected,
            START,
        )
        return reservation, pigs

    def test_approve_requires_configured_parent_pin(self):
        self.claim(150)
        pig_id = self.full_pigs()[0]["id"]
        reservation = self.service.reserve_exchange(
            1,
            "買東西",
            [pig_id],
            START,
        )
        before = self.store.snapshot()["revision"]

        error = self.assert_domain_error(
            "pin_not_configured",
            lambda: self.service.approve_exchange(
                reservation["token"],
                "123456",
                "同意",
                START,
            ),
        )

        self.assertEqual("家長密碼尚未設定", str(error))
        self.assertEqual(before, self.store.snapshot()["revision"])

    def test_correct_pin_completes_once_and_feeds_change_to_earliest_hole(self):
        reservation, original_pigs = self.prepare()
        original_active = self.rows(
            "SELECT id FROM pigs WHERE status='growing'"
        )[0]["id"]
        self.execute(
            """
            UPDATE warehouse_pages
            SET pending_bonus=4
            WHERE page_no=1
            """
        )
        before = self.store.snapshot()["revision"]

        result = self.service.approve_exchange(
            reservation["token"],
            "123456",
            "  同意購買  ",
            START + timedelta(minutes=1),
        )

        exchange = self.rows(
            "SELECT * FROM exchanges WHERE id=?",
            (reservation["id"],),
        )[0]
        broken = self.rows(
            "SELECT * FROM pigs WHERE reserved_exchange_id IS NULL AND status='broken'"
        )
        refilled = self.rows(
            "SELECT * FROM pigs WHERE id=?",
            (original_active,),
        )[0]
        active = self.rows("SELECT * FROM pigs WHERE status='growing'")[0]
        page = self.rows(
            "SELECT * FROM warehouse_pages WHERE page_no=1"
        )[0]
        ledger = self.rows(
            "SELECT * FROM ledger WHERE kind='exchange_spend'"
        )[0]
        metadata = json.loads(ledger["metadata"])
        self.assertEqual(
            {
                original_pigs[1]["id"],
                original_pigs[3]["id"],
            },
            {row["id"] for row in broken},
        )
        self.assertEqual(
            {(1, 2, 150), (1, 4, 150)},
            {(row["page_no"], row["slot_no"], row["value"]) for row in broken},
        )
        self.assertEqual(
            ("full", 150, 1, 2),
            (
                refilled["status"],
                refilled["value"],
                refilled["page_no"],
                refilled["slot_no"],
            ),
        )
        self.assertEqual(50, active["value"])
        self.assertEqual((None, None, 4), (
            page["complete_since"],
            page["last_bonus_date"],
            page["pending_bonus"],
        ))
        self.assertEqual(
            ("completed", "同意購買", (START + timedelta(minutes=1)).isoformat()),
            (
                exchange["status"],
                exchange["parent_note"],
                exchange["completed_at"],
            ),
        )
        self.assertEqual(
            ("exchange_spend", -200, 800, "交換：同意購買", before + 1),
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
                "exchange_id": reservation["id"],
                "child_note": "買文具",
                "parent_note": "同意購買",
                "pig_ids": reservation["pig_ids"],
                "total_pig_value": 300,
                "change_amount": 100,
                "bonus_pages_at_risk": [1],
            },
            metadata,
        )
        self.assertEqual(
            {
                "revision": before + 1,
                "id": reservation["id"],
                "status": "completed",
                "spent": 200,
                "change": 100,
                "total": 300,
                "parent_note": "同意購買",
            },
            result,
        )

    def test_repeated_approval_is_idempotent(self):
        reservation, _ = self.prepare(300)
        first = self.service.approve_exchange(
            reservation["token"],
            "123456",
            "同意",
            START,
        )
        revision = self.store.snapshot()["revision"]

        second = self.service.approve_exchange(
            reservation["token"],
            "123456",
            "同意",
            START + timedelta(minutes=1),
        )

        self.assertEqual(first, second)
        self.assertEqual(revision, self.store.snapshot()["revision"])
        self.assertEqual(
            1,
            len(self.rows("SELECT * FROM ledger WHERE kind='exchange_spend'")),
        )

    def test_wrong_pin_failures_commit_lock_and_later_success_clears_them(self):
        reservation, _ = self.prepare(300)
        financial_revision = self.store.snapshot()["revision"]

        for expected_failures in (1, 2, 3):
            error = self.assert_domain_error(
                "bad_pin",
                lambda: self.service.approve_exchange(
                    reservation["token"],
                    "000000",
                    "同意",
                    START,
                ),
            )
            self.assertEqual("家長密碼錯誤", str(error))
            attempt = self.rows(
                "SELECT * FROM pin_attempts WHERE scope='exchange-parent'"
            )[0]
            self.assertEqual(expected_failures, attempt["failures"])

        attempt = self.rows(
            "SELECT * FROM pin_attempts WHERE scope='exchange-parent'"
        )[0]
        self.assertEqual(
            (START + timedelta(minutes=10)).isoformat(),
            attempt["locked_until"],
        )
        self.assertEqual(financial_revision, self.store.snapshot()["revision"])

        locked = self.assert_domain_error(
            "pin_locked",
            lambda: self.service.approve_exchange(
                reservation["token"],
                "123456",
                "同意",
                START + timedelta(minutes=9, seconds=59),
            ),
        )
        self.assertEqual("家長密碼已暫時鎖定", str(locked))

        result = self.service.approve_exchange(
            reservation["token"],
            "123456",
            "同意",
            START + timedelta(minutes=10),
        )
        attempt = self.rows(
            "SELECT * FROM pin_attempts WHERE scope='exchange-parent'"
        )[0]
        self.assertEqual((0, None), (attempt["failures"], attempt["locked_until"]))
        self.assertEqual("completed", result["status"])

    def test_parent_note_validation_does_not_consume_pin_attempt(self):
        reservation, _ = self.prepare(300)
        before = self.store.snapshot()["revision"]

        for note in ("", "   ", "x" * 81):
            with self.subTest(note=note):
                with self.assertRaises(ValueError):
                    self.service.approve_exchange(
                        reservation["token"],
                        "123456",
                        note,
                        START,
                    )

        self.assertEqual([], self.rows("SELECT * FROM pin_attempts"))
        self.assertEqual(before, self.store.snapshot()["revision"])

    def test_unknown_cancelled_and_expired_tokens_return_safe_errors(self):
        self.assert_domain_error(
            "exchange_not_found",
            lambda: self.service.approve_exchange(
                "unknown",
                "123456",
                "同意",
                START,
            ),
        )

        self.claim(300)
        self.service.set_parent_pin("123456", START)
        pigs = self.full_pigs()
        cancelled = self.service.reserve_exchange(
            1, "取消", [pigs[0]["id"]], START
        )
        self.service.cancel_exchange(cancelled["token"], START)
        self.assert_domain_error(
            "exchange_cancelled",
            lambda: self.service.approve_exchange(
                cancelled["token"], "123456", "同意", START
            ),
        )

        expired = self.service.reserve_exchange(
            1, "過期", [pigs[1]["id"]], START
        )
        self.service.expire_exchanges(START + timedelta(minutes=15))
        self.assert_domain_error(
            "exchange_expired",
            lambda: self.service.approve_exchange(
                expired["token"],
                "123456",
                "同意",
                START + timedelta(minutes=15),
            ),
        )


class TestCancelExpireAndStatus(ExchangeTestCase):
    def reserve_two(self) -> tuple[dict, list[sqlite3.Row]]:
        self.claim(300)
        pigs = self.full_pigs()
        reservation = self.service.reserve_exchange(
            100,
            "預約",
            [pigs[1]["id"], pigs[0]["id"]],
            START,
        )
        return reservation, pigs

    def test_cancel_restores_exact_pigs_and_is_idempotent_without_ledger(self):
        reservation, pigs = self.reserve_two()
        before = self.store.snapshot()["revision"]
        ledger_before = len(self.rows("SELECT * FROM ledger"))

        first = self.service.cancel_exchange(reservation["token"], START)
        after_first = self.store.snapshot()["revision"]
        second = self.service.cancel_exchange(reservation["token"], START)

        restored = {
            row["id"]: row
            for row in self.rows(
                "SELECT * FROM pigs WHERE id IN (?, ?)",
                (pigs[0]["id"], pigs[1]["id"]),
            )
        }
        for original in pigs[:2]:
            current = restored[original["id"]]
            self.assertEqual(
                (
                    "full",
                    original["value"],
                    original["page_no"],
                    original["slot_no"],
                    None,
                ),
                (
                    current["status"],
                    current["value"],
                    current["page_no"],
                    current["slot_no"],
                    current["reserved_exchange_id"],
                ),
            )
        self.assertEqual("cancelled", first["status"])
        self.assertEqual(first, second)
        self.assertEqual(before + 1, after_first)
        self.assertEqual(after_first, self.store.snapshot()["revision"])
        self.assertEqual(ledger_before, len(self.rows("SELECT * FROM ledger")))

    def test_cancel_completed_is_rejected(self):
        self.claim(150)
        self.service.set_parent_pin("123456", START)
        pig_id = self.full_pigs()[0]["id"]
        reservation = self.service.reserve_exchange(
            1, "消費", [pig_id], START
        )
        self.service.approve_exchange(
            reservation["token"], "123456", "同意", START
        )

        self.assert_domain_error(
            "exchange_completed",
            lambda: self.service.cancel_exchange(
                reservation["token"], START
            ),
        )

    def test_expire_multiple_pending_restores_all_and_bumps_once(self):
        self.claim(600)
        pigs = self.full_pigs()
        first = self.service.reserve_exchange(
            1, "第一筆", [pigs[0]["id"], pigs[1]["id"]], START
        )
        second = self.service.reserve_exchange(
            1, "第二筆", [pigs[2]["id"], pigs[3]["id"]], START
        )
        before = self.store.snapshot()["revision"]
        ledger_before = len(self.rows("SELECT * FROM ledger"))

        result = self.service.expire_exchanges(
            START + timedelta(minutes=15)
        )

        self.assertEqual({"revision": before + 1, "expired": 2}, result)
        self.assertEqual(
            ["expired", "expired"],
            [
                row["status"]
                for row in self.rows("SELECT * FROM exchanges ORDER BY id")
            ],
        )
        self.assertTrue(
            all(
                row["status"] == "full"
                and row["reserved_exchange_id"] is None
                and row["value"] == 150
                for row in self.rows(
                    "SELECT * FROM pigs WHERE id IN (?, ?, ?, ?)",
                    tuple(first["pig_ids"] + second["pig_ids"]),
                )
            )
        )
        self.assertEqual(ledger_before, len(self.rows("SELECT * FROM ledger")))

        repeated = self.service.expire_exchanges(
            START + timedelta(minutes=16)
        )
        self.assertEqual(
            {"revision": before + 1, "expired": 0},
            repeated,
        )

    def test_approve_at_expiry_commits_expiration_before_error(self):
        reservation, pigs = self.reserve_two()
        before = self.store.snapshot()["revision"]

        self.assert_domain_error(
            "exchange_expired",
            lambda: self.service.approve_exchange(
                reservation["token"],
                "123456",
                "同意",
                START + timedelta(minutes=15),
            ),
        )

        exchange = self.rows(
            "SELECT * FROM exchanges WHERE id=?",
            (reservation["id"],),
        )[0]
        restored = self.rows(
            "SELECT * FROM pigs WHERE id IN (?, ?)",
            (pigs[0]["id"], pigs[1]["id"]),
        )
        self.assertEqual("expired", exchange["status"])
        self.assertTrue(all(row["status"] == "full" for row in restored))
        self.assertEqual(before + 1, self.store.snapshot()["revision"])

    def test_exchange_status_expires_first_and_never_leaks_token_hash(self):
        reservation, _ = self.reserve_two()

        result = self.service.exchange_status(
            reservation["id"],
            START + timedelta(minutes=15),
        )

        self.assertEqual(
            {
                "id",
                "status",
                "requested_amount",
                "change_amount",
                "expires_at",
                "completed_at",
                "parent_note",
                "revision",
            },
            set(result),
        )
        self.assertEqual("expired", result["status"])
        self.assertNotIn("token", result)
        self.assertNotIn("token_hash", result)

    def test_exchange_status_rejects_unknown_id(self):
        self.assert_domain_error(
            "exchange_not_found",
            lambda: self.service.exchange_status("missing", START),
        )


class TestExchangeTimeValidation(ExchangeTestCase):
    def test_all_new_service_now_arguments_reject_naive_datetimes(self):
        naive = START.replace(tzinfo=None)
        calls = (
            lambda: self.service.set_parent_pin("123456", naive),
            lambda: self.service.preview_exchange(1, ["pig"], naive),
            lambda: self.service.reserve_exchange(1, "用途", ["pig"], naive),
            lambda: self.service.approve_exchange(
                "token", "123456", "同意", naive
            ),
            lambda: self.service.cancel_exchange("token", naive),
            lambda: self.service.expire_exchanges(naive),
            lambda: self.service.exchange_status("exchange", naive),
        )

        for call in calls:
            with self.subTest(call=call):
                with self.assertRaisesRegex(
                    ValueError,
                    "now must be timezone-aware",
                ):
                    call()


if __name__ == "__main__":
    unittest.main()
