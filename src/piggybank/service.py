"""Transactional allowance and pig domain service."""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from piggybank.auth import hash_pin, new_token, token_hash, verify_pin
from piggybank.portraits import meta, save_backdrop_image, save_cover_image
from piggybank.schedule import (
    TAIPEI,
    eligible_periods,
    next_allowance_at,
    starter_effective_date,
)
from piggybank.store import Store

DEFAULT_ALLOWANCE_AMOUNT = 30
DEFAULT_GUIDE_FOOT = 88.0
DEFAULT_GUIDE_COIN = 22.0


def _clamp_guide(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("guide must be a number")
    number = float(value)
    if number != number:  # NaN
        raise ValueError("guide must be a number")
    return min(96.0, max(4.0, number))


class DomainError(Exception):
    """Expected product error with a stable code and safe message."""

    code: str

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class PiggyService:
    def __init__(
        self,
        store: Store,
        household: Store | None = None,
        child_id: str = "child1",
        portrait_root: Path | None = None,
    ) -> None:
        self.store = store
        self.household = household or store
        self.child_id = child_id
        self.portrait_root = portrait_root or store.db_path.parent

    def _same_ledger(self) -> bool:
        return self.household.db_path == self.store.db_path

    @staticmethod
    def _adventure_day_key(now: datetime) -> str:
        return (now.astimezone(TAIPEI) - timedelta(hours=16)).date().isoformat()

    @staticmethod
    def _adventure_questions(child_id: str, day_key: str) -> list[dict]:
        rng = random.Random(f"{child_id}:{day_key}:piggy-adventure-v1")
        result = []
        for index in range(10):
            operation = index % 3
            if operation == 0:
                left, right = rng.randint(3, 19), rng.randint(2, 15)
                answer = left + right
                prompt = f"{left} + {right} 等於多少？"
            elif operation == 1:
                left, right = rng.randint(8, 30), rng.randint(2, 7)
                if right > left:
                    left, right = right, left
                answer = left - right
                prompt = f"{left} − {right} 等於多少？"
            else:
                left, right = rng.randint(2, 9), rng.randint(2, 5)
                answer = left * right
                prompt = f"{left} × {right} 等於多少？"
            choices = {answer}
            while len(choices) < 3:
                choices.add(max(0, answer + rng.choice((-9, -5, -2, 2, 4, 7))))
            options = list(choices)
            rng.shuffle(options)
            result.append({
                "day_key": day_key,
                "question_no": index,
                "poi_no": index // 2,
                "prompt": prompt,
                "options": json.dumps(options),
                "answer": answer,
            })
        return result

    def adventure_state(self, now: datetime) -> dict:
        self._require_aware(now)
        self.store.initialize()
        day_key = self._adventure_day_key(now)
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            exists = conn.execute(
                "SELECT 1 FROM adventure_questions WHERE day_key=? LIMIT 1",
                (day_key,),
            ).fetchone()
            if exists is None:
                conn.executemany(
                    """INSERT INTO adventure_questions
                    (day_key, question_no, poi_no, prompt, options, answer)
                    VALUES (:day_key, :question_no, :poi_no, :prompt, :options, :answer)""",
                    self._adventure_questions(self.child_id, day_key),
                )
                conn.executemany(
                    "INSERT INTO adventure_pois (day_key, poi_no) VALUES (?, ?)",
                    [(day_key, i) for i in range(5)],
                )
                Store.bump_revision(conn)
            day = conn.execute(
                "SELECT * FROM adventure_days WHERE day_key=?", (day_key,)
            ).fetchone()
            questions = list(conn.execute(
                "SELECT question_no, revealed_at, solved_at FROM adventure_questions WHERE day_key=? ORDER BY question_no",
                (day_key,),
            ))
            pois = list(conn.execute(
                "SELECT poi_no, cleared_at FROM adventure_pois WHERE day_key=? ORDER BY poi_no",
                (day_key,),
            ))
            badges = {
                row["badge_id"]: {
                    "left": int(row["left_count"] or 0),
                    "right": int(row["right_count"] or 0),
                }
                for row in conn.execute(
                    """SELECT badge_id,
                    SUM(CASE WHEN piece='left' THEN count ELSE 0 END) AS left_count,
                    SUM(CASE WHEN piece='right' THEN count ELSE 0 END) AS right_count
                    FROM adventure_badges GROUP BY badge_id"""
                )
            }
            return {
                "day_key": day_key,
                "question_limit": 10,
                "questions_revealed": sum(q["revealed_at"] is not None for q in questions),
                "correct_count": sum(q["solved_at"] is not None for q in questions),
                "reward_ready": bool(day and day["reward_grant_id"]),
                "reward_claimed": bool(day and day["reward_grant_id"] and conn.execute(
                    "SELECT claimed_at FROM grants WHERE id=?",
                    (day["reward_grant_id"],),
                ).fetchone()["claimed_at"]),
                "reward_grant_id": day["reward_grant_id"] if day else None,
                "pois": [
                    {
                        "poi_no": int(p["poi_no"]),
                        "revealed": any(q["revealed_at"] is not None and q["question_no"] // 2 == p["poi_no"] for q in questions),
                        "cleared": p["cleared_at"] is not None,
                    }
                    for p in pois
                ],
                "questions": [
                    {
                        "question_no": int(q["question_no"]),
                        "revealed": q["revealed_at"] is not None,
                        "solved": q["solved_at"] is not None,
                    }
                    for q in questions
                ],
                "badges": badges,
                "boss_defeated": bool(day and day["completed_at"]),
            }

    def adventure_question(self, poi_no: int, slot: int, now: datetime) -> dict:
        self._require_aware(now)
        if isinstance(poi_no, bool) or poi_no not in range(5) or isinstance(slot, bool) or slot not in (0, 1):
            raise ValueError("invalid point of interest")
        state = self.adventure_state(now)
        day_key = state["day_key"]
        question_no = poi_no * 2 + slot
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM adventure_questions WHERE day_key=? AND question_no=?",
                (day_key, question_no),
            ).fetchone()
            if slot == 1:
                first = conn.execute(
                    "SELECT solved_at FROM adventure_questions WHERE day_key=? AND question_no=?",
                    (day_key, question_no - 1),
                ).fetchone()
                if first is None or first["solved_at"] is None:
                    raise DomainError("question_locked", "先完成這個地點的第一個挑戰")
            if row["revealed_at"] is None:
                revealed = conn.execute(
                    "SELECT COUNT(*) AS n FROM adventure_questions WHERE day_key=? AND revealed_at IS NOT NULL",
                    (day_key,),
                ).fetchone()["n"]
                if int(revealed) >= 10:
                    raise DomainError("daily_limit", "今天的探索題目已經看完了")
                conn.execute(
                    "UPDATE adventure_questions SET revealed_at=? WHERE day_key=? AND question_no=?",
                    (timestamp, day_key, question_no),
                )
                Store.bump_revision(conn)
            return {
                "question_no": question_no,
                "prompt": row["prompt"],
                "options": json.loads(row["options"]),
                "solved": row["solved_at"] is not None,
            }

    def answer_adventure_question(self, question_no: int, answer: int, now: datetime) -> dict:
        self._require_aware(now)
        if isinstance(question_no, bool) or question_no not in range(10):
            raise ValueError("invalid question")
        if isinstance(answer, bool) or not isinstance(answer, int):
            raise ValueError("answer must be an integer")
        day_key = self._adventure_day_key(now)
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            question = conn.execute(
                "SELECT * FROM adventure_questions WHERE day_key=? AND question_no=?",
                (day_key, question_no),
            ).fetchone()
            if question is None or question["revealed_at"] is None:
                raise DomainError("question_unavailable", "先從地圖選一個探索點")
            if question["solved_at"] is not None:
                return {"correct": True, "already_solved": True}
            if answer not in json.loads(question["options"]):
                raise ValueError("answer must be one of the choices")
            if int(question["answer"]) != answer:
                return {"correct": False, "hint": "試著拆成比較簡單的小步驟，再算一次。"}
            conn.execute(
                "UPDATE adventure_questions SET solved_at=? WHERE day_key=? AND question_no=?",
                (timestamp, day_key, question_no),
            )
            poi_no = int(question["poi_no"])
            cleared = conn.execute(
                "SELECT COUNT(*) AS n FROM adventure_questions WHERE day_key=? AND poi_no=? AND solved_at IS NOT NULL",
                (day_key, poi_no),
            ).fetchone()["n"] == 2
            found = None
            if cleared:
                conn.execute(
                    "UPDATE adventure_pois SET cleared_at=? WHERE day_key=? AND poi_no=? AND cleared_at IS NULL",
                    (timestamp, day_key, poi_no),
                )
                if poi_no < 4:
                    badge_id = f"forest-{poi_no // 2 + 1}"
                    piece = "left" if poi_no % 2 == 0 else "right"
                else:
                    badge_id = "forest-1"
                    pair = conn.execute(
                        "SELECT piece, count FROM adventure_badges WHERE badge_id=?",
                        (badge_id,),
                    ).fetchall()
                    counts = {row["piece"]: int(row["count"]) for row in pair}
                    piece = "left" if counts.get("left", 0) <= counts.get("right", 0) else "right"
                conn.execute(
                    """INSERT INTO adventure_badges (badge_id, piece, count) VALUES (?, ?, 1)
                    ON CONFLICT(badge_id, piece) DO UPDATE SET count=count+1""",
                    (badge_id, piece),
                )
                found = {"badge_id": badge_id, "piece": piece}
            correct_count = conn.execute(
                "SELECT COUNT(*) AS n FROM adventure_questions WHERE day_key=? AND solved_at IS NOT NULL",
                (day_key,),
            ).fetchone()["n"]
            grant_id = None
            if int(correct_count) >= 5:
                conn.execute(
                    "INSERT OR IGNORE INTO adventure_days (day_key) VALUES (?)", (day_key,)
                )
                day = conn.execute(
                    "SELECT reward_grant_id FROM adventure_days WHERE day_key=?", (day_key,)
                ).fetchone()
                if day["reward_grant_id"] is None:
                    grant_id = uuid4().hex
                    conn.execute(
                        "INSERT INTO grants (id, amount, note, is_bonus, created_at) VALUES (?, 5, '每日冒險通關', 1, ?)",
                        (grant_id, timestamp),
                    )
                    conn.execute(
                        "UPDATE adventure_days SET reward_grant_id=?, completed_at=? WHERE day_key=?",
                        (grant_id, timestamp, day_key),
                    )
            Store.bump_revision(conn)
            reward = conn.execute(
                "SELECT reward_grant_id FROM adventure_days WHERE day_key=?",
                (day_key,),
            ).fetchone()
            return {
                "correct": True,
                "correct_count": int(correct_count),
                "poi_cleared": cleared,
                "fragment": found,
                "boss_defeated": int(correct_count) >= 5,
                "reward_new": grant_id is not None,
                "reward_grant_id": grant_id or (reward["reward_grant_id"] if reward else None),
            }

    def _authorize_parent(self, pin: str, current: datetime) -> DomainError | None:
        with self.household.transaction() as conn:
            return self._authorize_parent_in_transaction(conn, pin, current)

    def has_exchange_token(self, digest: str) -> bool:
        if not digest:
            return False
        conn = self.store._connect()
        try:
            row = conn.execute(
                "SELECT 1 FROM exchanges WHERE token_hash=? LIMIT 1",
                (digest,),
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    @staticmethod
    def _require_aware(now: datetime) -> None:
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("now must be timezone-aware")

    @staticmethod
    def _revision(conn) -> int:
        return int(
            conn.execute(
                "SELECT value FROM settings WHERE key='revision'"
            ).fetchone()["value"]
        )

    @staticmethod
    def _authorize_parent_in_transaction(
        conn,
        pin: str,
        current: datetime,
    ) -> DomainError | None:
        setting = conn.execute(
            """
            SELECT value
            FROM settings
            WHERE key='parent_pin_hash'
            """
        ).fetchone()
        if setting is None:
            raise DomainError(
                "pin_not_configured",
                "家長密碼尚未設定",
            )

        attempt = conn.execute(
            """
            SELECT failures, locked_until
            FROM pin_attempts
            WHERE scope='exchange-parent'
            """
        ).fetchone()
        failures = attempt["failures"] if attempt is not None else 0
        locked_until = (
            datetime.fromisoformat(attempt["locked_until"])
            if attempt is not None and attempt["locked_until"] is not None
            else None
        )
        if locked_until is not None and current < locked_until:
            raise DomainError(
                "pin_locked",
                "家長密碼已暫時鎖定",
            )
        if locked_until is not None:
            failures = 0

        if not verify_pin(pin, setting["value"]):
            failures += 1
            next_locked_until = (
                (current + timedelta(minutes=10)).isoformat()
                if failures >= 3
                else None
            )
            conn.execute(
                """
                INSERT INTO pin_attempts (
                  scope, failures, locked_until
                )
                VALUES ('exchange-parent', ?, ?)
                ON CONFLICT(scope) DO UPDATE SET
                  failures=excluded.failures,
                  locked_until=excluded.locked_until
                """,
                (failures, next_locked_until),
            )
            return DomainError(
                "bad_pin",
                "家長密碼錯誤",
            )

        conn.execute(
            """
            INSERT INTO pin_attempts (
              scope, failures, locked_until
            )
            VALUES ('exchange-parent', 0, NULL)
            ON CONFLICT(scope) DO UPDATE SET
              failures=0, locked_until=NULL
            """
        )
        return None

    @staticmethod
    def _preview_in_transaction(
        conn,
        amount: int,
        pig_ids: list[str],
    ) -> dict:
        if (
            isinstance(amount, bool)
            or not isinstance(amount, int)
            or amount <= 0
        ):
            raise ValueError("amount must be a positive integer")
        if not pig_ids:
            raise ValueError("pig_ids must not be empty")
        if len(set(pig_ids)) != len(pig_ids):
            raise ValueError("pig_ids must not contain duplicates")

        selected = []
        for pig_id in pig_ids:
            pig = conn.execute(
                """
                SELECT id, status, value, hit_count, pending_yield,
                       page_no, slot_no
                FROM pigs
                WHERE id=?
                """,
                (pig_id,),
            ).fetchone()
            if pig is not None and pig["status"] == "reserved":
                raise DomainError(
                    "pig_reserved",
                    "這筆消費還在等待父母核准",
                )
            if pig is None or pig["status"] not in ("growing", "full"):
                raise DomainError(
                    "pig_not_breakable",
                    "目前無法消費",
                )
            selected.append(pig)

        total = sum(pig["value"] for pig in selected)
        if total < amount:
            raise DomainError(
                "insufficient_pigs",
                "錢包金額不足",
            )

        return {
            "requested_amount": amount,
            "total_pig_value": total,
            "change_amount": total - amount,
            "pig_ids": list(pig_ids),
            "pigs": [
                {
                    "id": pig["id"],
                    "value": pig["value"],
                    "hit_count": pig["hit_count"],
                    "page_no": pig["page_no"],
                    "slot_no": pig["slot_no"],
                }
                for pig in selected
            ],
            "bonus_pages_at_risk": [],
        }

    @staticmethod
    def _restore_exchange_pigs(conn, exchange_id: str) -> None:
        conn.execute(
            """
            UPDATE pigs
            SET status='growing', reserved_exchange_id=NULL
            WHERE status='reserved' AND reserved_exchange_id=?
            """,
            (exchange_id,),
        )

    @classmethod
    def _expire_exchange_in_transaction(cls, conn, exchange_id: str) -> None:
        conn.execute(
            """
            UPDATE exchanges
            SET status='expired'
            WHERE id=? AND status='pending'
            """,
            (exchange_id,),
        )
        cls._restore_exchange_pigs(conn, exchange_id)

    @classmethod
    def _exchange_status_result(cls, conn, exchange) -> dict:
        return {
            "id": exchange["id"],
            "status": exchange["status"],
            "requested_amount": exchange["requested_amount"],
            "change_amount": exchange["change_amount"],
            "expires_at": exchange["expires_at"],
            "completed_at": exchange["completed_at"],
            "parent_note": exchange["parent_note"],
            "revision": cls._revision(conn),
        }

    @classmethod
    def _completed_exchange_result(cls, conn, exchange) -> dict:
        completion_revision = cls._revision(conn)
        for ledger in conn.execute(
            """
            SELECT revision, metadata
            FROM ledger
            WHERE kind='exchange_spend'
            """
        ):
            metadata = json.loads(ledger["metadata"])
            if metadata.get("exchange_id") == exchange["id"]:
                completion_revision = ledger["revision"]
                break
        return {
            "revision": completion_revision,
            "id": exchange["id"],
            "status": "completed",
            "spent": exchange["requested_amount"],
            "change": exchange["change_amount"],
            "total": exchange["total_pig_value"],
            "parent_note": exchange["parent_note"],
        }

    @staticmethod
    def _accrue_in_transaction(conn, now: datetime) -> bool:
        leftover = conn.execute(
            """
            SELECT 1 FROM pigs
            WHERE pending_yield > 0
            LIMIT 1
            """
        ).fetchone()
        if leftover is None:
            return False
        conn.execute("UPDATE pigs SET pending_yield=0 WHERE pending_yield > 0")
        return True

    @staticmethod
    def _feed_in_transaction(conn, amount: int, timestamp: str) -> None:
        active = conn.execute(
            """
            SELECT id, value, last_yield_date
            FROM pigs
            WHERE status='growing'
            """
        ).fetchone()
        if active is None:
            raise DomainError(
                "pig_reserved",
                "這隻撲滿正在兌換中",
            )
        new_value = active["value"] + amount
        last_yield = active["last_yield_date"]
        if last_yield is None and new_value > 0:
            last_yield = timestamp
        conn.execute(
            """
            UPDATE pigs
            SET value=?, last_yield_date=?
            WHERE id=?
            """,
            (new_value, last_yield, active["id"]),
        )

    def set_parent_pin(self, pin: str, now: datetime) -> dict:
        self._require_aware(now)
        encoded = hash_pin(pin)
        with self.store.transaction() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('parent_pin_hash', ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                (encoded,),
            )
            revision = Store.bump_revision(conn)
            return {"revision": revision}

    def authorize_parent(self, pin: str, now: datetime) -> None:
        self._require_aware(now)
        current = now.astimezone(TAIPEI)
        deferred_error = self._authorize_parent(pin, current)
        if deferred_error is not None:
            raise deferred_error

    def _save_portrait(self, kind: str, blob: bytes) -> dict:
        root = self.portrait_root
        if kind == "cover":
            dest = save_cover_image(root, blob, self.child_id)
            rev_key = "cover_rev"
        elif kind == "backdrop":
            dest = save_backdrop_image(root, blob, self.child_id)
            rev_key = "backdrop_rev"
        else:
            raise ValueError("invalid portrait")
        with self.store.transaction() as conn:
            revision = Store.bump_revision(conn)
        return {
            "revision": revision,
            rev_key: int(dest.stat().st_mtime),
            **meta(root, self.child_id),
        }

    def save_cover(self, blob: bytes) -> dict:
        return self._save_portrait("cover", blob)

    def save_backdrop(self, blob: bytes) -> dict:
        return self._save_portrait("backdrop", blob)

    def set_theme(self, theme: str, pin: str, now: datetime) -> dict:
        self._require_aware(now)
        if theme not in {"kuromi", "melody", "cinnamoroll"}:
            raise ValueError("invalid theme")
        current = now.astimezone(TAIPEI)
        if not self._same_ledger():
            deferred_error = self._authorize_parent(pin, current)
            if deferred_error is not None:
                raise deferred_error
            with self.store.transaction() as conn:
                conn.execute(
                    """
                    INSERT INTO settings (key, value)
                    VALUES ('theme', ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """,
                    (theme,),
                )
                return {
                    "revision": Store.bump_revision(conn),
                    "theme": theme,
                }
        result = None
        with self.store.transaction() as conn:
            deferred_error = self._authorize_parent_in_transaction(
                conn,
                pin,
                current,
            )
            if deferred_error is None:
                conn.execute(
                    """
                    INSERT INTO settings (key, value)
                    VALUES ('theme', ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """,
                    (theme,),
                )
                result = {
                    "revision": Store.bump_revision(conn),
                    "theme": theme,
                }
        if deferred_error is not None:
            raise deferred_error
        if result is None:
            raise RuntimeError("theme update produced no result")
        return result

    def parent_settings(self, pin: str, now: datetime) -> dict:
        self._require_aware(now)
        current = now.astimezone(TAIPEI)
        if not self._same_ledger():
            deferred_error = self._authorize_parent(pin, current)
            if deferred_error is not None:
                raise deferred_error
            with self.store.transaction() as conn:
                theme = conn.execute(
                    "SELECT value FROM settings WHERE key='theme'"
                ).fetchone()
                allowance = conn.execute(
                    """
                    SELECT id, amount, period, weekday, monthday,
                           effective_date, created_at
                    FROM allowance_rules
                    ORDER BY effective_date DESC, id DESC
                    LIMIT 1
                    """
                ).fetchone()
                return {
                    "theme": theme["value"] if theme is not None else "melody",
                    "allowance_rule": (
                        dict(allowance) if allowance is not None else None
                    ),
                }
        result = None
        with self.store.transaction() as conn:
            deferred_error = self._authorize_parent_in_transaction(
                conn,
                pin,
                current,
            )
            if deferred_error is None:
                theme = conn.execute(
                    "SELECT value FROM settings WHERE key='theme'"
                ).fetchone()
                allowance = conn.execute(
                    """
                    SELECT id, amount, period, weekday, monthday,
                           effective_date, created_at
                    FROM allowance_rules
                    ORDER BY effective_date DESC, id DESC
                    LIMIT 1
                    """
                ).fetchone()
                result = {
                    "theme": theme["value"] if theme is not None else "melody",
                    "allowance_rule": (
                        dict(allowance) if allowance is not None else None
                    ),
                }
        if deferred_error is not None:
            raise deferred_error
        if result is None:
            raise RuntimeError("parent settings read produced no result")
        return result

    def resolve_exchange(self, token: str, now: datetime) -> dict:
        self._require_aware(now)
        self.expire_exchanges(now)
        digest = token_hash(token) if token else ""
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            exchange = conn.execute(
                """
                SELECT id, status, requested_amount, child_note,
                       total_pig_value, change_amount, expires_at,
                       completed_at
                FROM exchanges
                WHERE token_hash=?
                """,
                (digest,),
            ).fetchone()
            if exchange is None:
                raise DomainError(
                    "exchange_not_found",
                    "找不到這筆兌換",
                )
            return dict(exchange)
        finally:
            conn.close()

    def ledger(
        self,
        limit: int = 50,
        before: str | None = None,
    ) -> list[dict]:
        if (
            isinstance(limit, bool)
            or not isinstance(limit, int)
            or not 1 <= limit <= 100
        ):
            raise ValueError("limit must be between 1 and 100")
        before_revision = None
        if before is not None:
            if (
                not isinstance(before, str)
                or not before.isascii()
                or not before.isdecimal()
            ):
                raise ValueError("before must be a positive revision")
            before_revision = int(before)
            if before_revision <= 0:
                raise ValueError("before must be a positive revision")

        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            if before_revision is None:
                rows = conn.execute(
                    """
                    SELECT id, kind, amount, balance_after, note,
                           metadata, created_at, revision
                    FROM ledger
                    ORDER BY created_at DESC, revision DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
            else:
                rows = conn.execute(
                    """
                    SELECT id, kind, amount, balance_after, note,
                           metadata, created_at, revision
                    FROM ledger
                    WHERE revision < ?
                    ORDER BY created_at DESC, revision DESC
                    LIMIT ?
                    """,
                    (before_revision, limit),
                )
            return [
                {
                    **dict(row),
                    "metadata": json.loads(row["metadata"]),
                }
                for row in rows
            ]
        finally:
            conn.close()

    def preview_exchange(
        self,
        amount: int,
        pig_ids: list[str],
        now: datetime,
    ) -> dict:
        self._require_aware(now)
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            return self._preview_in_transaction(conn, amount, pig_ids)
        finally:
            conn.close()

    def reserve_exchange(
        self,
        amount: int,
        child_note: str,
        pig_ids: list[str],
        now: datetime,
    ) -> dict:
        self._require_aware(now)
        note = child_note.strip()
        if not note or len(note) > 80:
            raise ValueError("child_note must contain 1 to 80 characters")
        current = now.astimezone(TAIPEI)
        timestamp = current.isoformat()
        with self.store.transaction() as conn:
            reserved = conn.execute(
                """
                SELECT 1 FROM pigs WHERE status='reserved' LIMIT 1
                """
            ).fetchone()
            if reserved is None and self._collapse_to_one_pig(conn, timestamp):
                Store.bump_revision(conn)
                live = conn.execute(
                    """
                    SELECT id FROM pigs
                    WHERE status IN ('growing','full')
                    ORDER BY created_at, id
                    LIMIT 1
                    """
                ).fetchone()
                if live is not None:
                    pig_ids = [live["id"]]
        self.preview_exchange(amount, pig_ids, now)
        expires_at = (current + timedelta(minutes=15)).isoformat()
        exchange_id = uuid4().hex
        token = new_token()
        with self.store.transaction() as conn:
            preview = self._preview_in_transaction(conn, amount, pig_ids)
            stored_ids = list(preview["pig_ids"])
            conn.execute(
                """
                INSERT INTO exchanges (
                  id, token_hash, status, requested_amount, child_note,
                  pig_ids, total_pig_value, change_amount, expires_at,
                  created_at
                )
                VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    exchange_id,
                    token_hash(token),
                    amount,
                    note,
                    json.dumps(
                        stored_ids,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    preview["total_pig_value"],
                    preview["change_amount"],
                    expires_at,
                    timestamp,
                ),
            )
            for pig_id in stored_ids:
                conn.execute(
                    """
                    UPDATE pigs
                    SET status='reserved', reserved_exchange_id=?
                    WHERE id=? AND status IN ('growing','full')
                    """,
                    (exchange_id, pig_id),
                )
            revision = Store.bump_revision(conn)
            return {
                "revision": revision,
                "id": exchange_id,
                "token": token,
                "expires_at": expires_at,
                "requested_amount": amount,
                "total_pig_value": preview["total_pig_value"],
                "change_amount": preview["change_amount"],
                "pig_ids": stored_ids,
                "bonus_pages_at_risk": preview["bonus_pages_at_risk"],
            }

    def approve_exchange(
        self,
        token: str,
        pin: str,
        parent_note: str,
        now: datetime,
    ) -> dict:
        self._require_aware(now)
        current = now.astimezone(TAIPEI)
        timestamp = current.isoformat()
        digest = token_hash(token) if token else ""
        deferred_error = None
        result = None

        with self.store.transaction() as conn:
            exchange = conn.execute(
                "SELECT * FROM exchanges WHERE token_hash=?",
                (digest,),
            ).fetchone()
            if exchange is None:
                raise DomainError(
                    "exchange_not_found",
                    "找不到這筆兌換",
                )
            if exchange["status"] == "completed":
                return self._completed_exchange_result(conn, exchange)
            if exchange["status"] == "cancelled":
                raise DomainError(
                    "exchange_cancelled",
                    "這筆兌換已取消",
                )
            if exchange["status"] == "expired":
                raise DomainError(
                    "exchange_expired",
                    "這筆兌換已過期",
                )
            if current >= datetime.fromisoformat(exchange["expires_at"]):
                self._expire_exchange_in_transaction(conn, exchange["id"])
                Store.bump_revision(conn)
                deferred_error = DomainError(
                    "exchange_expired",
                    "這筆兌換已過期",
                )
            else:
                note = parent_note.strip()
                if not note or len(note) > 80:
                    raise ValueError(
                        "parent_note must contain 1 to 80 characters"
                    )

                deferred_error = (
                    self._authorize_parent_in_transaction(conn, pin, current)
                    if self._same_ledger()
                    else self._authorize_parent(pin, current)
                )
                if deferred_error is None:
                    pig_ids = json.loads(exchange["pig_ids"])
                    selected = []
                    for pig_id in pig_ids:
                        pig = conn.execute(
                            """
                            SELECT id, status, value, page_no, slot_no,
                                   reserved_exchange_id
                            FROM pigs
                            WHERE id=?
                            """,
                            (pig_id,),
                        ).fetchone()
                        if (
                            pig is None
                            or pig["status"] != "reserved"
                            or pig["reserved_exchange_id"] != exchange["id"]
                        ):
                            raise DomainError(
                                "exchange_conflict",
                                "兌換狀態已變更",
                            )
                        selected.append(pig)

                    remaining = exchange["change_amount"]
                    for pig in selected:
                        conn.execute(
                            """
                            UPDATE pigs
                            SET status='growing', value=?,
                                reserved_exchange_id=NULL
                            WHERE id=?
                              AND status='reserved'
                              AND reserved_exchange_id=?
                            """,
                            (remaining, pig["id"], exchange["id"]),
                        )
                    conn.execute(
                        """
                        UPDATE exchanges
                        SET status='completed', parent_note=?,
                            completed_at=?
                        WHERE id=?
                        """,
                        (note, timestamp, exchange["id"]),
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
                        VALUES (?, 'exchange_spend', ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            uuid4().hex,
                            -exchange["requested_amount"],
                            balance,
                            f"消費：{note}",
                            json.dumps(
                                {
                                    "exchange_id": exchange["id"],
                                    "child_note": exchange["child_note"],
                                    "parent_note": note,
                                    "pig_ids": pig_ids,
                                    "total_pig_value": exchange[
                                        "total_pig_value"
                                    ],
                                    "change_amount": exchange[
                                        "change_amount"
                                    ],
                                },
                                ensure_ascii=False,
                                separators=(",", ":"),
                            ),
                            timestamp,
                            revision,
                        ),
                    )
                    result = {
                        "revision": revision,
                        "id": exchange["id"],
                        "status": "completed",
                        "spent": exchange["requested_amount"],
                        "change": exchange["change_amount"],
                        "total": exchange["total_pig_value"],
                        "parent_note": note,
                    }

        if deferred_error is not None:
            raise deferred_error
        if result is None:
            raise RuntimeError("exchange approval produced no result")
        return result

    def cancel_exchange(self, token: str, now: datetime) -> dict:
        self._require_aware(now)
        digest = token_hash(token) if token else ""
        with self.store.transaction() as conn:
            exchange = conn.execute(
                "SELECT * FROM exchanges WHERE token_hash=?",
                (digest,),
            ).fetchone()
            if exchange is None:
                raise DomainError(
                    "exchange_not_found",
                    "找不到這筆兌換",
                )
            if exchange["status"] == "completed":
                raise DomainError(
                    "exchange_completed",
                    "這筆兌換已完成",
                )
            if exchange["status"] in ("cancelled", "expired"):
                return self._exchange_status_result(conn, exchange)

            conn.execute(
                """
                UPDATE exchanges
                SET status='cancelled'
                WHERE id=?
                """,
                (exchange["id"],),
            )
            self._restore_exchange_pigs(conn, exchange["id"])
            Store.bump_revision(conn)
            updated = conn.execute(
                "SELECT * FROM exchanges WHERE id=?",
                (exchange["id"],),
            ).fetchone()
            return self._exchange_status_result(conn, updated)

    def expire_exchanges(self, now: datetime) -> dict:
        self._require_aware(now)
        current = now.astimezone(TAIPEI)
        with self.store.transaction() as conn:
            expired = [
                exchange
                for exchange in conn.execute(
                    "SELECT * FROM exchanges WHERE status='pending'"
                )
                if current >= datetime.fromisoformat(exchange["expires_at"])
            ]
            for exchange in expired:
                self._expire_exchange_in_transaction(
                    conn,
                    exchange["id"],
                )
            revision = (
                Store.bump_revision(conn)
                if expired
                else self._revision(conn)
            )
            return {
                "revision": revision,
                "expired": len(expired),
            }

    def exchange_status(self, exchange_id: str, now: datetime) -> dict:
        self._require_aware(now)
        self.expire_exchanges(now)
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            exchange = conn.execute(
                "SELECT * FROM exchanges WHERE id=?",
                (exchange_id,),
            ).fetchone()
            if exchange is None:
                raise DomainError(
                    "exchange_not_found",
                    "找不到這筆兌換",
                )
            return self._exchange_status_result(conn, exchange)
        finally:
            conn.close()

    def accrue(self, now: datetime) -> dict:
        self._require_aware(now)
        with self.store.transaction() as conn:
            changed = self._accrue_in_transaction(conn, now)
            if changed:
                revision = Store.bump_revision(conn)
            else:
                revision = int(
                    conn.execute(
                        "SELECT value FROM settings WHERE key='revision'"
                    ).fetchone()["value"]
                )
            return {"revision": revision, "changed": changed}

    def harvest_pig(self, pig_id: str, now: datetime) -> dict:
        self._require_aware(now)
        with self.store.transaction() as conn:
            changed = self._accrue_in_transaction(conn, now)
            if changed:
                Store.bump_revision(conn)
        raise DomainError(
            "nothing_to_harvest",
            "目前沒有可收的收益",
        )

    def initialize(self, now: datetime) -> None:
        self._require_aware(now)
        self.store.initialize()
        current = now.astimezone(TAIPEI)
        timestamp = current.isoformat()
        changed = False
        with self.store.transaction() as conn:
            if self._collapse_to_one_pig(conn, timestamp):
                changed = True
            if conn.execute(
                "SELECT 1 FROM allowance_rules LIMIT 1"
            ).fetchone() is None:
                conn.execute(
                    """
                    INSERT INTO allowance_rules (
                      amount, period, weekday, monthday,
                      effective_date, created_at
                    )
                    VALUES (?, 'daily', NULL, NULL, ?, ?)
                    """,
                    (
                        DEFAULT_ALLOWANCE_AMOUNT,
                        starter_effective_date(current).isoformat(),
                        timestamp,
                    ),
                )
                changed = True
            if changed:
                Store.bump_revision(conn)

    @staticmethod
    def _collapse_to_one_pig(conn, timestamp: str) -> bool:
        growing = conn.execute(
            "SELECT * FROM pigs WHERE status='growing'"
        ).fetchone()
        others = conn.execute(
            """
            SELECT * FROM pigs
            WHERE status IN ('full','reserved')
            ORDER BY created_at, id
            """
        ).fetchall()
        if growing is None and not others:
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
            return True
        keeper = growing if growing is not None else others[0]
        extras = [
            pig for pig in others if pig["id"] != keeper["id"]
        ]
        already_one = (
            growing is not None
            and not extras
            and keeper["page_no"] is None
            and keeper["slot_no"] is None
            and keeper["reserved_exchange_id"] is None
        )
        if already_one:
            return False
        total = keeper["value"] + sum(pig["value"] for pig in extras)
        pending = 0
        last_yield = keeper["last_yield_date"]
        if last_yield is None:
            last_yield = next(
                (
                    pig["last_yield_date"]
                    for pig in extras
                    if pig["last_yield_date"] is not None
                ),
                timestamp if total > 0 else None,
            )
        for pig in extras:
            conn.execute(
                """
                UPDATE pigs
                SET status='broken', page_no=NULL, slot_no=NULL,
                    reserved_exchange_id=NULL
                WHERE id=?
                """,
                (pig["id"],),
            )
        conn.execute(
            """
            UPDATE pigs
            SET status='growing', value=?, pending_yield=?,
                page_no=NULL, slot_no=NULL, reserved_exchange_id=NULL,
                last_yield_date=?
            WHERE id=?
            """,
            (total, pending, last_yield, keeper["id"]),
        )
        return True

    def set_allowance(
        self,
        amount: int,
        period: str,
        effective_date: date,
        now: datetime,
        weekday: int | None = None,
        monthday: int | None = None,
    ) -> int:
        self._require_aware(now)
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
        self.store.initialize()
        if not self._same_ledger():
            self.household.initialize()
        guides = self._pig_guides()
        self.accrue(now)
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
                """
                SELECT * FROM pigs
                WHERE status IN ('growing','full','reserved')
                ORDER BY CASE status WHEN 'growing' THEN 0 ELSE 1 END,
                         created_at, id
                LIMIT 1
                """
            ).fetchone()
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
            theme_row = conn.execute(
                "SELECT value FROM settings WHERE key='theme'"
            ).fetchone()
            nxt = next_allowance_at(rules, claimed_keys, now)
            current = now.astimezone(TAIPEI)
            pending_grants = self._pending_grants(conn)
            return {
                "revision": revision,
                **meta(self.portrait_root, self.child_id),
                "theme": (
                    theme_row["value"]
                    if theme_row is not None
                    else "melody"
                ),
                "now": current.isoformat(),
                "total": total,
                "active_pig": (
                    {field: active[field] for field in public_pig_fields}
                    if active is not None
                    else None
                ),
                "next_allowance_at": nxt.isoformat() if nxt is not None else None,
                "claimable_periods": eligible_periods(
                    rules,
                    claimed_keys,
                    now,
                ),
                "pending_grants": pending_grants,
                "pig_guides": guides,
            }
        finally:
            conn.close()

    @staticmethod
    def _pending_grants(conn) -> list[dict]:
        return [
            {
                "id": row["id"],
                "amount": int(row["amount"]),
                "note": row["note"],
                "is_bonus": bool(row["is_bonus"]),
            }
            for row in conn.execute(
                """
                SELECT id, amount, note, is_bonus
                FROM grants
                WHERE claimed_at IS NULL
                ORDER BY created_at, id
                """
            )
        ]

    def _pig_guides(self) -> dict:
        conn = self.household._connect()
        try:
            rows = {
                row["key"]: row["value"]
                for row in conn.execute(
                    """
                    SELECT key, value FROM settings
                    WHERE key IN ('pig_guide_foot', 'pig_guide_coin')
                    """
                )
            }
        finally:
            conn.close()
        foot = rows.get("pig_guide_foot")
        coin = rows.get("pig_guide_coin")
        return {
            "foot": (
                _clamp_guide(float(foot))
                if foot is not None
                else DEFAULT_GUIDE_FOOT
            ),
            "coin": (
                _clamp_guide(float(coin))
                if coin is not None
                else DEFAULT_GUIDE_COIN
            ),
        }

    def set_guides(self, foot: object, coin: object) -> dict:
        self.household.initialize()
        clamped_foot = _clamp_guide(foot)
        clamped_coin = _clamp_guide(coin)
        with self.household.transaction() as conn:
            for key, value in (
                ("pig_guide_foot", clamped_foot),
                ("pig_guide_coin", clamped_coin),
            ):
                conn.execute(
                    """
                    INSERT INTO settings (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """,
                    (key, format(value, ".4g")),
                )
            Store.bump_revision(conn)
        return {
            "foot": clamped_foot,
            "coin": clamped_coin,
        }

    def grant_allowance(
        self,
        amount: int,
        note: str,
        is_bonus: bool,
        now: datetime,
    ) -> dict:
        self._require_aware(now)
        self.store.initialize()
        if isinstance(amount, bool) or not isinstance(amount, int) or amount < 1:
            raise ValueError("amount must be a positive integer")
        if not isinstance(is_bonus, bool):
            raise ValueError("is_bonus must be a boolean")
        if not isinstance(note, str):
            raise ValueError("note must be a string")
        text = note.strip()
        if len(text) > 80:
            raise ValueError("note must be at most 80 characters")
        timestamp = now.astimezone(TAIPEI).isoformat()
        grant_id = uuid4().hex
        with self.store.transaction() as conn:
            conn.execute(
                """
                INSERT INTO grants (
                  id, amount, note, is_bonus, created_at, claimed_at
                )
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (grant_id, amount, text, 1 if is_bonus else 0, timestamp),
            )
            revision = Store.bump_revision(conn)
        return {
            "id": grant_id,
            "amount": amount,
            "note": text,
            "is_bonus": is_bonus,
            "revision": revision,
        }

    def claim_grant(self, grant_id: str, now: datetime) -> dict:
        self._require_aware(now)
        self.store.initialize()
        if not isinstance(grant_id, str) or not grant_id:
            raise ValueError("grant_id is required")
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            pending = self._pending_grants(conn)
            bonuses = [item for item in pending if item["is_bonus"]]
            selected = next(
                (item for item in pending if item["id"] == grant_id),
                None,
            )
            if selected is None:
                raise DomainError("not_claimable", "這一筆不能領取")
            if bonuses and selected["id"] != bonuses[0]["id"]:
                raise DomainError("bonus_waiting", "請先領取獎金")
            updated = conn.execute(
                """
                UPDATE grants
                SET claimed_at=?
                WHERE id=? AND claimed_at IS NULL
                """,
                (timestamp, grant_id),
            )
            if updated.rowcount != 1:
                raise DomainError("not_claimable", "這一筆不能領取")
            self._feed_in_transaction(conn, selected["amount"], timestamp)
            balance = conn.execute(
                """
                SELECT COALESCE(SUM(value), 0) AS total
                FROM pigs
                WHERE status IN ('growing','full','reserved')
                """
            ).fetchone()["total"]
            revision = Store.bump_revision(conn)
            note = selected["note"] or (
                "特別獎金" if selected["is_bonus"] else "零用錢"
            )
            kind = "bonus_claim" if selected["is_bonus"] else "allowance_claim"
            conn.execute(
                """
                INSERT INTO ledger (
                  id, kind, amount, balance_after, note,
                  metadata, created_at, revision
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    kind,
                    selected["amount"],
                    balance,
                    note,
                    json.dumps(
                        {
                            "grant_id": selected["id"],
                            "is_bonus": selected["is_bonus"],
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
                "grant_id": selected["id"],
                "amount": selected["amount"],
                "is_bonus": selected["is_bonus"],
            }

    def claim(self, requested_period_key: str, now: datetime) -> dict:
        self._require_aware(now)
        self.store.initialize()
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            bonuses = [
                item for item in self._pending_grants(conn) if item["is_bonus"]
            ]
            if bonuses:
                raise DomainError("bonus_waiting", "請先領取獎金")
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
            self._feed_in_transaction(
                conn,
                selected["amount"],
                timestamp,
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
                        "今日零用錢"
                        if selected["claim_kind"] == "on_time"
                        else "補領零用錢"
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
