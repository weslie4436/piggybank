"""Transactional allowance and pig domain service."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from uuid import uuid4

from piggybank.auth import hash_pin, new_token, token_hash, verify_pin
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
                    "這隻撲滿正在兌換中",
                )
            if pig is None or pig["status"] != "full":
                raise DomainError(
                    "pig_not_breakable",
                    "這隻撲滿目前不能敲",
                )
            if pig["pending_yield"] > 0:
                raise DomainError(
                    "harvest_required",
                    "請先收取這隻撲滿的收益",
                )
            selected.append(pig)

        total = sum(pig["value"] for pig in selected)
        if total < amount:
            raise DomainError(
                "insufficient_pigs",
                "選取的撲滿金額不足",
            )

        risk_pages = []
        for page_no in sorted(
            {
                pig["page_no"]
                for pig in selected
                if pig["page_no"] is not None
            }
        ):
            page = conn.execute(
                """
                SELECT complete_since
                FROM warehouse_pages
                WHERE page_no=?
                """,
                (page_no,),
            ).fetchone()
            full_count = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM pigs
                WHERE page_no=? AND status IN ('full','reserved')
                """,
                (page_no,),
            ).fetchone()["count"]
            if (
                page is not None
                and page["complete_since"] is not None
                and full_count == 6
            ):
                risk_pages.append(page_no)

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
            "bonus_pages_at_risk": risk_pages,
        }

    @staticmethod
    def _restore_exchange_pigs(conn, exchange_id: str) -> None:
        conn.execute(
            """
            UPDATE pigs
            SET status='full', reserved_exchange_id=NULL
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
        current = now.astimezone(TAIPEI)
        changed = False
        for pig in conn.execute(
            """
            SELECT id, pending_yield, daily_yield, yield_cap,
                   last_yield_date
            FROM pigs
            WHERE status IN ('full','reserved')
              AND last_yield_date IS NOT NULL
            """
        ):
            cursor = datetime.fromisoformat(pig["last_yield_date"])
            periods = int(
                (current - cursor).total_seconds() // timedelta(days=1).total_seconds()
            )
            if periods <= 0:
                continue
            pending = min(
                pig["yield_cap"],
                pig["pending_yield"] + periods * pig["daily_yield"],
            )
            cursor += timedelta(days=periods)
            conn.execute(
                """
                UPDATE pigs
                SET pending_yield=?, last_yield_date=?
                WHERE id=?
                """,
                (pending, cursor.isoformat(), pig["id"]),
            )
            changed = True
        for page in conn.execute(
            """
            SELECT page_no, pending_bonus, last_bonus_date
            FROM warehouse_pages
            WHERE complete_since IS NOT NULL
              AND last_bonus_date IS NOT NULL
            """
        ):
            full_count = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM pigs
                WHERE page_no=? AND status IN ('full','reserved')
                """,
                (page["page_no"],),
            ).fetchone()["count"]
            if full_count != 6:
                continue
            cursor = datetime.fromisoformat(page["last_bonus_date"])
            periods = int(
                (current - cursor).total_seconds() // timedelta(days=1).total_seconds()
            )
            if periods <= 0:
                continue
            pending = min(6, page["pending_bonus"] + periods * 2)
            cursor += timedelta(days=periods)
            conn.execute(
                """
                UPDATE warehouse_pages
                SET pending_bonus=?, last_bonus_date=?
                WHERE page_no=?
                """,
                (pending, cursor.isoformat(), page["page_no"]),
            )
            changed = True
        return changed

    @staticmethod
    def _feed_in_transaction(conn, amount: int, timestamp: str) -> None:
        remaining = amount
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
                    timestamp,
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
                    (timestamp, timestamp, page_no),
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
        self.preview_exchange(amount, pig_ids, now)

        current = now.astimezone(TAIPEI)
        timestamp = current.isoformat()
        expires_at = (current + timedelta(minutes=15)).isoformat()
        exchange_id = uuid4().hex
        token = new_token()
        with self.store.transaction() as conn:
            preview = self._preview_in_transaction(conn, amount, pig_ids)
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
                        pig_ids,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    preview["total_pig_value"],
                    preview["change_amount"],
                    expires_at,
                    timestamp,
                ),
            )
            for pig_id in pig_ids:
                conn.execute(
                    """
                    UPDATE pigs
                    SET status='reserved', reserved_exchange_id=?
                    WHERE id=? AND status='full'
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
                "pig_ids": list(pig_ids),
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
                    if attempt is not None
                    and attempt["locked_until"] is not None
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
                    deferred_error = DomainError(
                        "bad_pin",
                        "家長密碼錯誤",
                    )
                else:
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

                    risk_pages = []
                    for page_no in sorted(
                        {
                            pig["page_no"]
                            for pig in selected
                            if pig["page_no"] is not None
                        }
                    ):
                        page = conn.execute(
                            """
                            SELECT complete_since
                            FROM warehouse_pages
                            WHERE page_no=?
                            """,
                            (page_no,),
                        ).fetchone()
                        full_count = conn.execute(
                            """
                            SELECT COUNT(*) AS count
                            FROM pigs
                            WHERE page_no=?
                              AND status IN ('full','reserved')
                            """,
                            (page_no,),
                        ).fetchone()["count"]
                        if (
                            page is not None
                            and page["complete_since"] is not None
                            and full_count == 6
                        ):
                            risk_pages.append(page_no)
                            conn.execute(
                                """
                                UPDATE warehouse_pages
                                SET complete_since=NULL,
                                    last_bonus_date=NULL
                                WHERE page_no=?
                                """,
                                (page_no,),
                            )

                    for pig_id in pig_ids:
                        conn.execute(
                            """
                            UPDATE pigs
                            SET status='broken', reserved_exchange_id=NULL
                            WHERE id=?
                              AND status='reserved'
                              AND reserved_exchange_id=?
                            """,
                            (pig_id, exchange["id"]),
                        )

                    self._feed_in_transaction(
                        conn,
                        exchange["change_amount"],
                        timestamp,
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
                            f"交換：{note}",
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
                                    "bonus_pages_at_risk": risk_pages,
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
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            self._accrue_in_transaction(conn, now)
            pig = conn.execute(
                """
                SELECT id, status, value, pending_yield
                FROM pigs
                WHERE id=?
                """,
                (pig_id,),
            ).fetchone()
            if pig is not None and pig["status"] == "reserved":
                raise DomainError(
                    "pig_reserved",
                    "這隻撲滿正在兌換中",
                )
            if (
                pig is None
                or pig["status"] != "full"
                or pig["pending_yield"] == 0
            ):
                raise DomainError(
                    "nothing_to_harvest",
                    "目前沒有可收的收益",
                )

            amount = pig["pending_yield"]
            value = pig["value"] + amount
            conn.execute(
                """
                UPDATE pigs
                SET value=?, pending_yield=0
                WHERE id=?
                """,
                (value, pig_id),
            )
            total = conn.execute(
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
                VALUES (?, 'pig_yield_harvest', ?, ?, '撲滿收益', ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    amount,
                    total,
                    json.dumps(
                        {"pig_id": pig_id},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    timestamp,
                    revision,
                ),
            )
            return {
                "revision": revision,
                "pig_id": pig_id,
                "amount": amount,
                "value": value,
                "total": total,
            }

    def harvest_page(self, page_no: int, now: datetime) -> dict:
        self._require_aware(now)
        timestamp = now.astimezone(TAIPEI).isoformat()
        with self.store.transaction() as conn:
            self._accrue_in_transaction(conn, now)
            page = conn.execute(
                """
                SELECT page_no, pending_bonus
                FROM warehouse_pages
                WHERE page_no=?
                """,
                (page_no,),
            ).fetchone()
            if page is None:
                raise DomainError(
                    "page_not_found",
                    "找不到這一頁倉庫",
                )
            if page["pending_bonus"] == 0:
                raise DomainError(
                    "nothing_to_harvest",
                    "目前沒有可收的收益",
                )

            amount = page["pending_bonus"]
            conn.execute(
                """
                UPDATE warehouse_pages
                SET pending_bonus=0
                WHERE page_no=?
                """,
                (page_no,),
            )
            self._feed_in_transaction(conn, amount, timestamp)
            total = conn.execute(
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
                VALUES (?, 'page_bonus_harvest', ?, ?,
                        '整頁儲蓄收益', ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    amount,
                    total,
                    json.dumps(
                        {"page_no": page_no},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    timestamp,
                    revision,
                ),
            )
            return {
                "revision": revision,
                "page_no": page_no,
                "amount": amount,
                "total": total,
            }

    def initialize(self, now: datetime) -> None:
        self._require_aware(now)
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
        self._require_aware(now)
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
