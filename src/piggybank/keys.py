"""Shareable invite door and one personal account per child."""

from __future__ import annotations

import hmac
import secrets
import sqlite3
from datetime import datetime

from piggybank.auth import new_token, token_hash
from piggybank.portraits import meta
from piggybank.schedule import TAIPEI
from piggybank.service import DomainError, PiggyService
from piggybank.store import Store


class VaultKeys:
    def __init__(self, store: Store) -> None:
        self.store = store

    def ensure_children(self) -> None:
        self.store.initialize()
        with self.store.transaction() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) AS n FROM children"
            ).fetchone()
            if int(existing["n"]):
                return
            settings = {
                row["key"]: row["value"]
                for row in conn.execute(
                    """
                    SELECT key, value FROM settings
                    WHERE key IN ('child_token_hash', 'display_name')
                    """
                )
            }
            saved_hash = settings.get("child_token_hash", "")
            name = (settings.get("display_name") or "").strip()
            if not saved_hash or not name:
                return
            conn.execute(
                """
                INSERT INTO children (
                  id, display_name, token_hash, store_kind, created_at
                )
                VALUES ('child1', ?, ?, 'legacy', ?)
                """,
                (name, saved_hash, datetime.now(TAIPEI).isoformat()),
            )

    def _children(self) -> list[sqlite3.Row]:
        self.ensure_children()
        conn = self.store._connect()
        try:
            return list(conn.execute("SELECT * FROM children ORDER BY created_at, id"))
        finally:
            conn.close()

    def _child(self, child_id: str) -> sqlite3.Row:
        self.ensure_children()
        conn = self.store._connect()
        try:
            row = conn.execute(
                "SELECT * FROM children WHERE id=?",
                (child_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            raise DomainError("not_joined", "找不到這個戶頭")
        return row

    def _account_db(self, child_id: str):
        folder = self.store.db_path.parent / "accounts"
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{child_id}.sqlite3"

    def _account_store(self, child: sqlite3.Row) -> Store:
        if child["store_kind"] == "legacy":
            return self.store
        return Store(self._account_db(child["id"]))

    def open_service(self, child_id: str) -> PiggyService:
        child = self._child(child_id)
        return PiggyService(
            self._account_store(child),
            household=self.store,
            child_id=child["id"],
            portrait_root=self.store.db_path.parent,
        )

    def service_for_exchange_token(self, token: str) -> PiggyService | None:
        digest = token_hash(token) if token else ""
        if not digest:
            return None
        for child in self._children():
            service = self.open_service(child["id"])
            try:
                if service.has_exchange_token(digest):
                    return service
            except sqlite3.OperationalError:
                continue
        return None

    def _reader(self, child: sqlite3.Row) -> dict:
        account = self._account_store(child)
        conn = account._connect()
        try:
            theme_row = conn.execute(
                "SELECT value FROM settings WHERE key='theme'"
            ).fetchone()
        finally:
            conn.close()
        theme = theme_row["value"] if theme_row is not None else "melody"
        return {
            "id": child["id"],
            "display_name": child["display_name"],
            "theme": theme,
            **meta(self.store.db_path.parent, child["id"]),
        }

    def _by_name(self, conn: sqlite3.Connection, name: str) -> sqlite3.Row | None:
        return conn.execute(
            "SELECT * FROM children WHERE display_name=?",
            (name,),
        ).fetchone()

    def create_invite(self) -> str:
        token = new_token()
        digest = token_hash(token)
        with self.store.transaction() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('invite_token_hash', ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                (digest,),
            )
            Store.bump_revision(conn)
        return token

    def door_for(self, token: str) -> dict | None:
        if not token:
            return None
        digest = token_hash(token)
        self.ensure_children()
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            invite_row = conn.execute(
                "SELECT value FROM settings WHERE key='invite_token_hash'"
            ).fetchone()
            invite_hash = invite_row["value"] if invite_row is not None else ""
            if invite_hash and hmac.compare_digest(digest, invite_hash):
                return {"kind": "invite"}
            children = list(conn.execute("SELECT * FROM children"))
        finally:
            conn.close()
        for child in children:
            if hmac.compare_digest(digest, child["token_hash"]):
                return {"kind": "personal", "reader": self._reader(child)}
        return None

    def join(self, invite_token: str, display_name: str, now: datetime | None = None) -> dict:
        if not isinstance(display_name, str):
            raise ValueError("display_name must contain 1 to 20 characters")
        name = display_name.strip()
        if not 1 <= len(name) <= 20:
            raise ValueError("display_name must contain 1 to 20 characters")

        digest = token_hash(invite_token) if invite_token else ""
        personal_token = new_token()
        personal_digest = token_hash(personal_token)
        current = now or datetime.now(TAIPEI)
        self.ensure_children()
        created_id = ""
        with self.store.transaction() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='invite_token_hash'"
            ).fetchone()
            if row is None or not hmac.compare_digest(digest, row["value"]):
                raise DomainError("invalid_invite", "邀請連結無效")
            existing = self._by_name(conn, name)
            if existing is not None:
                raise DomainError(
                    "already_joined",
                    "這個名字已經有個人頁，請用原本的連結打開",
                )
            elif conn.execute("SELECT 1 FROM children LIMIT 1").fetchone() is None:
                created_id = "child1"
                conn.execute(
                    """
                    INSERT INTO children (
                      id, display_name, token_hash, store_kind, created_at
                    )
                    VALUES ('child1', ?, ?, 'legacy', ?)
                    """,
                    (name, personal_digest, current.isoformat()),
                )
            else:
                created_id = "c" + secrets.token_hex(8)
                conn.execute(
                    """
                    INSERT INTO children (
                      id, display_name, token_hash, store_kind, created_at
                    )
                    VALUES (?, ?, ?, 'account', ?)
                    """,
                    (created_id, name, personal_digest, current.isoformat()),
                )
            Store.bump_revision(conn)
        child = self._child(created_id)
        if child["store_kind"] == "account":
            self.open_service(created_id).initialize(current)
        return {
            "token": personal_token,
            "reader": self._reader(child),
        }

    def reissue_personal(self) -> dict:
        personal_token = new_token()
        personal_digest = token_hash(personal_token)
        self.ensure_children()
        with self.store.transaction() as conn:
            children = list(conn.execute("SELECT * FROM children ORDER BY created_at, id"))
            if not children:
                raise DomainError(
                    "not_joined",
                    "還沒完成綁定，請先用邀請連結建立個人頁",
                )
            if len(children) != 1:
                raise DomainError(
                    "not_joined",
                    "已經有多個戶頭，請用邀請連結進入自己的個人頁",
                )
            conn.execute(
                "UPDATE children SET token_hash=? WHERE id=?",
                (personal_digest, children[0]["id"]),
            )
            Store.bump_revision(conn)
            child_id = children[0]["id"]
        child = self._child(child_id)
        return {
            "token": personal_token,
            "reader": self._reader(child),
        }
