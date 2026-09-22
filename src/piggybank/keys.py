"""One-time invite and personal vault key management."""

from __future__ import annotations

import hmac

from piggybank.auth import new_token, token_hash
from piggybank.portraits import meta
from piggybank.service import DomainError
from piggybank.store import Store


class VaultKeys:
    def __init__(self, store: Store) -> None:
        self.store = store

    def _reader(self, settings: dict[str, str]) -> dict:
        return {
            "id": "child1",
            "display_name": settings["display_name"],
            "theme": settings.get("theme", "melody"),
            **meta(self.store.db_path.parent),
        }

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
        conn = self.store._connect()
        try:
            conn.execute("BEGIN")
            settings = {
                row["key"]: row["value"]
                for row in conn.execute(
                    """
                    SELECT key, value
                    FROM settings
                    WHERE key IN (
                      'invite_token_hash',
                      'child_token_hash',
                      'display_name',
                      'theme'
                    )
                    """
                )
            }
            invite_hash = settings.get("invite_token_hash", "")
            if invite_hash and hmac.compare_digest(digest, invite_hash):
                return {"kind": "invite"}
            child_hash = settings.get("child_token_hash", "")
            if child_hash and hmac.compare_digest(digest, child_hash):
                return {
                    "kind": "personal",
                    "reader": self._reader(settings),
                }
            return None
        finally:
            conn.close()

    def join(self, invite_token: str, display_name: str) -> dict:
        if not isinstance(display_name, str):
            raise ValueError("display_name must contain 1 to 20 characters")
        name = display_name.strip()
        if not 1 <= len(name) <= 20:
            raise ValueError("display_name must contain 1 to 20 characters")

        digest = token_hash(invite_token) if invite_token else ""
        personal_token = new_token()
        personal_digest = token_hash(personal_token)
        with self.store.transaction() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='invite_token_hash'"
            ).fetchone()
            if row is None or not hmac.compare_digest(digest, row["value"]):
                raise DomainError(
                    "invalid_invite",
                    "邀請連結無效或已使用",
                )
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('child_token_hash', ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                (personal_digest,),
            )
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('display_name', ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                (name,),
            )
            conn.execute(
                "DELETE FROM settings WHERE key='invite_token_hash'"
            )
            Store.bump_revision(conn)
            settings = {
                row["key"]: row["value"]
                for row in conn.execute(
                    """
                    SELECT key, value
                    FROM settings
                    WHERE key IN ('display_name', 'theme')
                    """
                )
            }
        return {
            "token": personal_token,
            "reader": self._reader(settings),
        }

    def reissue_personal(self) -> dict:
        personal_token = new_token()
        personal_digest = token_hash(personal_token)
        with self.store.transaction() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key='child_token_hash'"
            ).fetchone()
            if row is None:
                raise DomainError(
                    "not_joined",
                    "還沒完成綁定，請先用邀請連結建立個人頁",
                )
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('child_token_hash', ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                (personal_digest,),
            )
            Store.bump_revision(conn)
            settings = {
                row["key"]: row["value"]
                for row in conn.execute(
                    """
                    SELECT key, value
                    FROM settings
                    WHERE key IN ('display_name', 'theme')
                    """
                )
            }
        return {
            "token": personal_token,
            "reader": self._reader(settings),
        }
