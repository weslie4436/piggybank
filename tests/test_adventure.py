"""Forest encounter: math cards, pending loot, player HP."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

TAIPEI = ZoneInfo("Asia/Taipei")


class AdventureTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "test.sqlite3"
        self.store = Store(self.db_path)
        self.service = PiggyService(self.store, child_id="child1")
        self.now = datetime(2026, 9, 30, 19, 0, tzinfo=TAIPEI)

    def tearDown(self):
        self.tmp.cleanup()

    def rows(self, query: str, parameters: tuple = ()) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(query, parameters).fetchall()
        finally:
            conn.close()

    def _answers_for(self, monster_id: str, day_key: str) -> list[int]:
        row = self.rows(
            "SELECT answers FROM adventure_monsters WHERE monster_id=? AND day_key=?",
            (monster_id, day_key),
        )[0]
        return json.loads(row["answers"])

    def _first_normal(self, opened: dict) -> dict:
        return next(item for item in opened["monsters"] if item["hp_max"] == 1)


class TestAdventureEncounter(AdventureTestCase):
    def test_store_creates_monster_and_hand_tables(self):
        self.store.initialize()
        names = {
            row["name"]
            for row in self.rows(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertIn("adventure_monsters", names)
        self.assertIn("adventure_wave_hands", names)

    def test_day_encounter_loot_is_between_18_and_30(self):
        self.service.initialize(self.now)
        for day in range(20):
            when = datetime(2026, 9, 12, 19, 0, tzinfo=TAIPEI) + timedelta(days=day)
            state = self.service.adventure_state(when)
            self.assertGreaterEqual(state["loot_total"], 18)
            self.assertLessEqual(state["loot_total"], 30)
            self.assertIn(state["wave_count"], (3, 5))
            self.assertEqual(5, state["player_hp"])
            rewards = [
                int(row["reward"])
                for row in self.rows(
                    "SELECT reward FROM adventure_monsters WHERE day_key=?",
                    (state["day_key"],),
                )
            ]
            self.assertEqual(state["loot_total"], sum(rewards))
            elites = self.rows(
                "SELECT reward, wave_no FROM adventure_monsters WHERE day_key=? AND is_elite=1",
                (state["day_key"],),
            )
            self.assertLessEqual(len(elites), 1)
            if elites:
                self.assertGreaterEqual(int(elites[0]["wave_no"]), 1)
                elite_reward = int(elites[0]["reward"])
                normals = [
                    int(row["reward"])
                    for row in self.rows(
                        "SELECT reward FROM adventure_monsters WHERE day_key=? AND is_elite=0",
                        (state["day_key"],),
                    )
                ]
                if normals:
                    self.assertGreaterEqual(elite_reward, max(normals) + 2)

    def test_correct_play_queues_grant_without_filling_the_pig(self):
        self.service.initialize(self.now)
        opened = self.service.enter_adventure(self.now)
        living = self._first_normal(opened)
        answer = self._answers_for(living["id"], opened["day_key"])[0]
        result = self.service.play_adventure_card(living["id"], answer, self.now)
        self.assertTrue(result["correct"])
        state = self.service.state(self.now)
        self.assertEqual(0, state["total"])
        self.assertTrue(state["pending_grants"])
        self.assertIn("森林裡撿到", state["pending_grants"][0]["note"])
        after = self.service.adventure_state(self.now)
        self.assertGreaterEqual(after["earned_today"], living["reward"])

    def test_wrong_play_costs_one_hp_and_keeps_the_card(self):
        self.service.initialize(self.now)
        opened = self.service.enter_adventure(self.now)
        living = opened["monsters"][0]
        wrong = max(opened["hand"]) + 99
        # pick a hand card that is not the current answer
        answers = set(self._answers_for(living["id"], opened["day_key"]))
        decoy = next(value for value in opened["hand"] if value not in answers)
        result = self.service.play_adventure_card(living["id"], decoy, self.now)
        self.assertFalse(result["correct"])
        self.assertEqual(4, result["player_hp"])
        again = self.service.adventure_state(self.now)
        self.assertEqual(opened["hand"], again["hand"])
        self.assertEqual(4, again["player_hp"])

    def test_enter_refills_hp_without_reviving_kills(self):
        self.service.initialize(self.now)
        opened = self.service.enter_adventure(self.now)
        living = self._first_normal(opened)
        decoy = next(
            value
            for value in opened["hand"]
            if value not in set(self._answers_for(living["id"], opened["day_key"]))
        )
        self.service.play_adventure_card(living["id"], decoy, self.now)
        answer = self._answers_for(living["id"], opened["day_key"])[0]
        self.service.play_adventure_card(living["id"], answer, self.now)
        refreshed = self.service.enter_adventure(self.now)
        self.assertEqual(5, refreshed["player_hp"])
        ids = {item["id"] for item in refreshed["monsters"]}
        self.assertNotIn(living["id"], ids)

    def test_elite_needs_two_different_answers(self):
        self.service.initialize(self.now)
        found = None
        for day in range(40):
            when = datetime(2026, 8, 1 + day, 19, 0, tzinfo=TAIPEI)
            state = self.service.adventure_state(when)
            row = self.rows(
                "SELECT monster_id, answers, wave_no FROM adventure_monsters WHERE day_key=? AND is_elite=1",
                (state["day_key"],),
            )
            if row:
                found = (when, dict(row[0]))
                break
        self.assertIsNotNone(found, "expected an elite within 40 seeded days")
        when, elite = found
        answers = json.loads(elite["answers"])
        self.assertEqual(2, len(answers))
        self.assertEqual(2, len(set(answers)))
        self.service.enter_adventure(when)
        # advance to the elite wave
        while True:
            board = self.service.adventure_state(when)
            if any(item["id"] == elite["monster_id"] for item in board["monsters"]):
                break
            current = board["monsters"][0]
            ans = self._answers_for(current["id"], board["day_key"])[current["hp_max"] - current["hp"]]
            self.service.play_adventure_card(current["id"], ans, when)
        shown = next(item for item in board["monsters"] if item["id"] == elite["monster_id"])
        first_prompt = shown["prompt"]
        first = self.service.play_adventure_card(elite["monster_id"], answers[0], when)
        self.assertTrue(first["correct"])
        self.assertFalse(first["defeated"])
        board = self.service.adventure_state(when)
        elite_view = next(item for item in board["monsters"] if item["id"] == elite["monster_id"])
        self.assertEqual(1, elite_view["hp"])
        self.assertNotEqual(elite_view["prompt"], first_prompt)
        self.assertEqual(elite_view["prompt"], first["prompt"])
        second = self.service.play_adventure_card(elite["monster_id"], answers[1], when)
        self.assertTrue(second["correct"])
        self.assertTrue(second["defeated"])

    def test_claiming_forest_loot_fills_the_pig(self):
        self.service.initialize(self.now)
        opened = self.service.enter_adventure(self.now)
        living = self._first_normal(opened)
        self.service.play_adventure_card(
            living["id"],
            self._answers_for(living["id"], opened["day_key"])[0],
            self.now,
        )
        grant = self.service.state(self.now)["pending_grants"][0]
        claimed = self.service.claim_grant(grant["id"], self.now)
        state = self.service.state(self.now)
        self.assertEqual(grant["amount"], claimed["amount"])
        self.assertEqual(grant["amount"], state["total"])
        self.assertEqual([], state["pending_grants"])
        kinds = [row["kind"] for row in self.rows("SELECT kind FROM ledger")]
        self.assertIn("adventure_reward", kinds)

    def test_wave_hand_has_answers_and_decoys_with_unique_values(self):
        self.service.initialize(self.now)
        state = self.service.enter_adventure(self.now)
        living_answers = []
        for monster in state["monsters"]:
            answers = self._answers_for(monster["id"], state["day_key"])
            living_answers.append(answers[monster["hp_max"] - monster["hp"]])
        for value in living_answers:
            self.assertIn(value, state["hand"])
        self.assertEqual(len(state["hand"]), len(set(state["hand"])))
        self.assertGreaterEqual(len(state["hand"]), len(living_answers) + 2)

    def _finish_today(self) -> dict:
        self.service.enter_adventure(self.now)
        for _ in range(80):
            board = self.service.adventure_state(self.now)
            if board["completed"]:
                return board
            monster = board["monsters"][0]
            answers = self._answers_for(monster["id"], board["day_key"])
            hit = monster["hp_max"] - monster["hp"]
            self.service.play_adventure_card(monster["id"], answers[hit], self.now)
        self.fail("could not finish today's forest")

    def test_unlimited_enter_starts_a_new_run_after_clearing_the_day(self):
        self.service.initialize(self.now)
        self.service.set_parent_pin("123456", self.now)
        finished = self._finish_today()
        self.assertTrue(finished["completed"])
        again = self.service.enter_adventure(self.now)
        self.assertTrue(again["completed"])
        self.service.set_adventure_unlimited("123456", True, self.now)
        replay = self.service.enter_adventure(self.now)
        self.assertFalse(replay["completed"])
        self.assertTrue(replay["monsters"])
        self.assertTrue(self.service.state(self.now)["adventure_unlimited"])


if __name__ == "__main__":
    unittest.main()
