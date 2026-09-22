"""Tests for the shareable invite door and personal vault keys."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from datetime import datetime
from zoneinfo import ZoneInfo

from piggybank.auth import token_hash
from piggybank.keys import VaultKeys
from piggybank.service import DomainError
from piggybank.store import Store


TAIPEI = ZoneInfo("Asia/Taipei")


class TestVaultKeys(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.store.initialize()
        self.keys = VaultKeys(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def settings(self) -> dict[str, str]:
        conn = sqlite3.connect(self.db_path)
        try:
            return dict(conn.execute("SELECT key, value FROM settings"))
        finally:
            conn.close()

    def children(self) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return list(conn.execute("SELECT * FROM children"))
        finally:
            conn.close()

    def test_create_invite_stores_only_hash_and_bumps_revision(self):
        before = self.store.snapshot()["revision"]

        invite = self.keys.create_invite()

        settings = self.settings()
        self.assertEqual(token_hash(invite), settings["invite_token_hash"])
        self.assertNotIn(invite.encode("utf-8"), self.db_path.read_bytes())
        self.assertEqual(before + 1, int(settings["revision"]))
        self.assertEqual({"kind": "invite"}, self.keys.door_for(invite))

    def test_join_sets_personal_reader_and_keeps_invite(self):
        invite = self.keys.create_invite()
        before = self.store.snapshot()["revision"]

        result = self.keys.join(invite, "  小明  ")

        settings = self.settings()
        children = self.children()
        self.assertEqual(1, len(children))
        self.assertEqual(token_hash(result["token"]), children[0]["token_hash"])
        self.assertEqual("小明", children[0]["display_name"])
        self.assertEqual("legacy", children[0]["store_kind"])
        self.assertEqual(token_hash(invite), settings["invite_token_hash"])
        self.assertNotIn(result["token"].encode("utf-8"), self.db_path.read_bytes())
        self.assertEqual(before + 1, int(settings["revision"]))
        self.assertEqual(
            {
                "id": "child1",
                "display_name": "小明",
                "theme": "melody",
                "has_cover": False,
                "cover_rev": 0,
                "has_backdrop": False,
                "backdrop_rev": 0,
            },
            result["reader"],
        )
        self.assertEqual(
            {"kind": "personal", "reader": result["reader"]},
            self.keys.door_for(result["token"]),
        )
        self.assertEqual({"kind": "invite"}, self.keys.door_for(invite))

    def test_each_name_gets_its_own_account(self):
        invite = self.keys.create_invite()
        first = self.keys.join(invite, "小明")
        second = self.keys.join(invite, "小花")

        self.assertNotEqual(first["reader"]["id"], second["reader"]["id"])
        kinds = {row["display_name"]: row["store_kind"] for row in self.children()}
        self.assertEqual("legacy", kinds["小明"])
        self.assertEqual("account", kinds["小花"])
        self.assertEqual(
            "小明",
            self.keys.door_for(first["token"])["reader"]["display_name"],
        )
        self.assertEqual(
            "小花",
            self.keys.door_for(second["token"])["reader"]["display_name"],
        )
        self.assertEqual({"kind": "invite"}, self.keys.door_for(invite))

        again = self.keys.join(invite, "小明")
        self.assertEqual(first["reader"]["id"], again["reader"]["id"])
        self.assertIsNone(self.keys.door_for(first["token"]))
        self.assertEqual(
            "小花",
            self.keys.door_for(second["token"])["reader"]["display_name"],
        )
        ming = self.keys.open_service(again["reader"]["id"])
        flower = self.keys.open_service(second["reader"]["id"])
        ming.initialize(datetime.now(TAIPEI))
        with ming.store.transaction() as conn:
            conn.execute(
                "UPDATE pigs SET value=10336 WHERE status='growing'"
            )
        now = datetime.now(TAIPEI)
        self.assertEqual(10336, ming.state(now)["total"])
        self.assertEqual(0, flower.state(now)["total"])

    def test_invalid_invite_changes_nothing(self):
        invite = self.keys.create_invite()
        self.keys.join(invite, "小明")
        before = self.settings()

        with self.assertRaises(DomainError) as raised:
            self.keys.join("not-the-invite", "另一個名字")

        self.assertEqual("invalid_invite", raised.exception.code)
        self.assertEqual(before, self.settings())

    def test_join_validates_trimmed_display_name_before_mutation(self):
        invite = self.keys.create_invite()
        before = self.settings()

        for name in ("", "   ", "孩" * 21):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    self.keys.join(invite, name)

        self.assertEqual(before, self.settings())

    def test_personal_door_reads_current_theme_without_exposing_hashes(self):
        invite = self.keys.create_invite()
        joined = self.keys.join(invite, "小明")
        with self.store.transaction() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('theme', 'kuromi')"
            )

        door = self.keys.door_for(joined["token"])

        self.assertEqual("kuromi", door["reader"]["theme"])
        self.assertNotIn("token", door)
        self.assertNotIn("token_hash", door)

    def test_reissue_personal_rotates_hash_and_invalidates_old_token(self):
        invite = self.keys.create_invite()
        joined = self.keys.join(invite, "小明")
        before = self.children()[0]["token_hash"]

        reissued = self.keys.reissue_personal()

        children = self.children()
        self.assertEqual("小明", reissued["reader"]["display_name"])
        self.assertEqual(token_hash(reissued["token"]), children[0]["token_hash"])
        self.assertNotEqual(before, children[0]["token_hash"])
        self.assertIsNone(self.keys.door_for(joined["token"]))
        self.assertEqual(
            {"kind": "personal", "reader": reissued["reader"]},
            self.keys.door_for(reissued["token"]),
        )

    def test_reissue_personal_before_join_is_not_joined(self):
        with self.assertRaises(DomainError) as raised:
            self.keys.reissue_personal()
        self.assertEqual("not_joined", raised.exception.code)


if __name__ == "__main__":
    unittest.main()
