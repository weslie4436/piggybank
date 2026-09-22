"""Real-socket integration tests for the PiggyBank vault HTTP server."""

from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import threading
import unittest
from datetime import datetime, timedelta
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

from piggybank import __main__ as cli
from piggybank.auth import verify_pin
from piggybank.keys import VaultKeys
from piggybank.paths import PAGES_BASE
from piggybank.service import PiggyService
from piggybank.store import Store
from piggybank.vault import make_server

TAIPEI = ZoneInfo("Asia/Taipei")


class VaultHttpTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.web_root = root / "web"
        self.web_root.mkdir()
        (self.web_root / "index.html").write_text(
            "<!doctype html><title>PiggyBank</title>",
            encoding="utf-8",
        )
        (self.web_root / "app.js").write_text(
            "window.ready = true;",
            encoding="utf-8",
        )
        self.store = Store(root / "piggybank.sqlite3")
        self.service = PiggyService(self.store)
        self.now = datetime.now(TAIPEI).replace(microsecond=0)
        self.service.initialize(self.now)
        self.keys = VaultKeys(self.store)
        invite = self.keys.create_invite()
        self.personal = self.keys.join(invite, "小明")["token"]
        self.service.set_parent_pin("123456", self.now)
        self.server = make_server(
            "127.0.0.1",
            0,
            self.store,
            self.web_root,
            PAGES_BASE,
        )
        self.thread = threading.Thread(
            target=self.server.serve_forever,
            daemon=True,
        )
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def request(
        self,
        method: str,
        target: str,
        body=None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        request_headers = dict(headers or {})
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(
                body,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(method, target, body=body, headers=request_headers)
            response = conn.getresponse()
            raw = response.read()
            return (
                response.status,
                {key.lower(): value for key, value in response.getheaders()},
                raw,
            )
        finally:
            conn.close()

    def json_request(self, *args, **kwargs) -> tuple[int, dict[str, str], dict]:
        status, headers, raw = self.request(*args, **kwargs)
        return status, headers, json.loads(raw.decode("utf-8"))

    def rows(self, query: str, parameters: tuple = ()) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.store.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(query, parameters).fetchall()
        finally:
            conn.close()

    def execute(self, query: str, parameters: tuple = ()) -> None:
        conn = sqlite3.connect(self.store.db_path)
        try:
            conn.execute(query, parameters)
            conn.commit()
        finally:
            conn.close()

    def prepare_full_pigs(self, amount: int = 600) -> list[sqlite3.Row]:
        yesterday = (self.now - timedelta(days=1)).date()
        self.service.set_allowance(amount, "daily", yesterday, self.now)
        self.service.claim(yesterday.isoformat(), self.now)
        return self.rows(
            "SELECT * FROM pigs WHERE status='growing' ORDER BY created_at, id"
        )


class TestHealthCorsAndStatic(VaultHttpTestCase):
    def test_health_echoes_allowed_pages_and_local_origins(self):
        pages_origin = (
            f"{urlsplit(PAGES_BASE).scheme}://{urlsplit(PAGES_BASE).netloc}"
        )
        for origin in (pages_origin, "http://127.0.0.1:4567", "http://localhost:9"):
            with self.subTest(origin=origin):
                status, headers, payload = self.json_request(
                    "GET",
                    "/api/health",
                    headers={"Origin": origin},
                )
                self.assertEqual(200, status)
                self.assertEqual({"ok": True}, payload)
                self.assertEqual(origin, headers["access-control-allow-origin"])
                self.assertEqual("Origin", headers["vary"])
                self.assertEqual("no-store", headers["cache-control"])

    def test_disallowed_origin_is_forbidden_without_cors_permission(self):
        status, headers, payload = self.json_request(
            "GET",
            "/api/health",
            headers={"Origin": "https://evil.example"},
        )

        self.assertEqual(403, status)
        self.assertEqual("cors_forbidden", payload["error"])
        self.assertNotIn("access-control-allow-origin", headers)

    def test_options_reports_exact_cors_contract(self):
        pages_origin = (
            f"{urlsplit(PAGES_BASE).scheme}://{urlsplit(PAGES_BASE).netloc}"
        )

        status, headers, raw = self.request(
            "OPTIONS",
            "/api/state",
            headers={
                "Origin": pages_origin,
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(204, status)
        self.assertEqual(b"", raw)
        self.assertEqual("GET, POST, PUT", headers["access-control-allow-methods"])
        self.assertEqual("Content-Type", headers["access-control-allow-headers"])
        self.assertEqual("600", headers["access-control-max-age"])
        self.assertEqual(pages_origin, headers["access-control-allow-origin"])

    def test_static_preview_serves_only_allowlisted_files_inside_root(self):
        status, headers, raw = self.request("GET", "/")
        self.assertEqual(200, status)
        self.assertEqual("text/html; charset=utf-8", headers["content-type"])
        self.assertIn(b"PiggyBank", raw)

        status, _, _ = self.request("GET", "/%2e%2e/secret.txt")
        self.assertEqual(404, status)
        status, _, _ = self.request("GET", "/app.exe")
        self.assertEqual(404, status)


class TestDoorJoinAndPersonalAuth(VaultHttpTestCase):
    def test_door_join_and_personal_state_flow(self):
        invite = self.keys.create_invite()

        status, _, door = self.json_request(
            "GET",
            f"/api/door?k={quote(invite)}",
        )
        self.assertEqual(200, status)
        self.assertEqual({"kind": "invite"}, door)

        status, _, joined = self.json_request(
            "POST",
            f"/api/join?k={quote(invite)}",
            {"display_name": "  小花  "},
        )
        self.assertEqual(200, status)
        token = joined["token"]
        self.assertEqual(
            f"{PAGES_BASE}/index.html?k={token}#k={token}",
            joined["url"],
        )
        self.assertEqual("小花", joined["reader"]["display_name"])

        status, _, unauthorized = self.json_request("GET", "/api/state")
        self.assertEqual(401, status)
        self.assertEqual("unauthorized", unauthorized["error"])

        status, _, state = self.json_request(
            "GET",
            f"/api/state?k={quote(token)}",
        )
        self.assertEqual(200, status)
        self.assertIn("active_pig", state)
        self.assertNotIn("child_token_hash", json.dumps(state))

    def test_second_name_does_not_share_the_first_balance(self):
        with self.store.transaction() as conn:
            conn.execute(
                "UPDATE pigs SET value=10336 WHERE status='growing'"
            )
        invite = self.keys.create_invite()
        status, _, joined = self.json_request(
            "POST",
            f"/api/join?k={quote(invite)}",
            {"display_name": "章晨風"},
        )
        self.assertEqual(200, status)
        flower = joined["token"]
        self.assertNotEqual(self.personal, flower)
        self.assertEqual("章晨風", joined["reader"]["display_name"])

        status, _, mine = self.json_request(
            "GET",
            f"/api/state?k={quote(self.personal)}",
        )
        status_flower, _, hers = self.json_request(
            "GET",
            f"/api/state?k={quote(flower)}",
        )
        self.assertEqual(200, status)
        self.assertEqual(200, status_flower)
        self.assertEqual(10336, mine["total"])
        self.assertEqual(0, hers["total"])
        self.assertNotEqual(mine["active_pig"]["id"], hers["active_pig"]["id"])

        status, _, door = self.json_request(
            "GET",
            f"/api/door?k={quote(self.personal)}",
        )
        self.assertEqual(200, status)
        self.assertEqual("小明", door["reader"]["display_name"])

    def test_unknown_door_key_is_unauthorized(self):
        cases = (
            ("GET", "/api/door?k=unknown-key", None),
            ("GET", "/api/door", None),
            ("POST", "/api/join", {"display_name": "小花"}),
        )
        for method, target, body in cases:
            with self.subTest(method=method, target=target):
                status, _, payload = self.json_request(
                    method,
                    target,
                    body,
                )
                self.assertEqual(401, status)
                self.assertIn(
                    payload["error"],
                    {"unauthorized", "invalid_invite"},
                )


class TestChildMoneyEndpoints(VaultHttpTestCase):
    def test_claim_preview_reserve_status_and_cancel_succeed(self):
        yesterday = (self.now - timedelta(days=1)).date()
        self.service.set_allowance(600, "daily", yesterday, self.now)
        key = quote(self.personal)

        status, _, claimed = self.json_request(
            "POST",
            f"/api/claim?k={key}",
            {"period_key": yesterday.isoformat()},
        )
        self.assertEqual(200, status)
        self.assertEqual(600, claimed["amount"])

        pigs = self.rows(
            "SELECT * FROM pigs WHERE status='growing' ORDER BY created_at, id"
        )

        selected = [pigs[0]["id"]]
        status, _, preview = self.json_request(
            "POST",
            f"/api/exchange/preview?k={key}",
            {"amount": 100, "child_note": "ignored", "pig_ids": selected},
        )
        self.assertEqual(200, status)
        self.assertEqual(pigs[0]["value"] - 100, preview["change_amount"])

        status, _, reservation = self.json_request(
            "POST",
            f"/api/exchange/reserve?k={key}",
            {"amount": 100, "child_note": "買文具", "pig_ids": selected},
        )
        self.assertEqual(200, status)
        self.assertEqual(
            f"{PAGES_BASE}/exchange.html?x={reservation['token']}",
            reservation["qr_url"],
        )

        status, _, exchange = self.json_request(
            "GET",
            f"/api/exchange/status?k={key}&id={reservation['id']}",
        )
        self.assertEqual(200, status)
        self.assertEqual("pending", exchange["status"])

        status, _, cancelled = self.json_request(
            "POST",
            f"/api/exchange/cancel?k={key}",
            {"x": reservation["token"]},
        )
        self.assertEqual(200, status)
        self.assertEqual("cancelled", cancelled["status"])

    def test_every_personal_endpoint_rejects_missing_key_first(self):
        cases = (
            ("GET", "/api/state", None),
            ("GET", "/api/ledger", None),
            ("POST", "/api/claim", {"period_key": "2026-01-01"}),
            (
                "POST",
                "/api/grant",
                {"pin": "123456", "amount": 10, "note": "", "is_bonus": False},
            ),
            (
                "POST",
                "/api/exchange/preview",
                {"amount": 1, "child_note": "", "pig_ids": ["pig"]},
            ),
            (
                "POST",
                "/api/exchange/reserve",
                {"amount": 1, "child_note": "用途", "pig_ids": ["pig"]},
            ),
            ("GET", "/api/exchange/status?id=exchange", None),
            ("GET", "/api/exchange/qr.svg?x=token", None),
            ("POST", "/api/exchange/cancel", {"x": "token"}),
            ("POST", "/api/settings/read", {"pin": "123456"}),
            (
                "PUT",
                "/api/settings/allowance",
                {
                    "pin": "123456",
                    "amount": 10,
                    "period": "daily",
                    "effective_date": "2026-01-01",
                    "weekday": None,
                    "monthday": None,
                },
            ),
            (
                "PUT",
                "/api/settings/theme",
                {"pin": "123456", "theme": "melody"},
            ),
            (
                "PUT",
                "/api/settings/guides",
                {"pin": "123456", "foot": 80, "coin": 20},
            ),
        )

        for method, target, body in cases:
            with self.subTest(method=method, target=target):
                status, _, payload = self.json_request(
                    method,
                    target,
                    body,
                )
                self.assertEqual(401, status)
                self.assertEqual("unauthorized", payload["error"])

    def test_ledger_and_parent_settings_endpoints(self):
        today = self.now.date()
        key = quote(self.personal)
        status, _, allowance = self.json_request(
            "PUT",
            f"/api/settings/allowance?k={key}",
            {
                "pin": "123456",
                "amount": 40,
                "period": "weekly",
                "effective_date": today.isoformat(),
                "weekday": today.weekday(),
                "monthday": None,
            },
        )
        self.assertEqual(200, status)
        self.assertIn("revision", allowance)

        status, _, theme = self.json_request(
            "PUT",
            f"/api/settings/theme?k={key}",
            {"pin": "123456", "theme": "cinnamoroll"},
        )
        self.assertEqual(200, status)
        self.assertEqual("cinnamoroll", theme["theme"])

        status, _, settings = self.json_request(
            "POST",
            f"/api/settings/read?k={key}",
            {"pin": "123456"},
        )
        self.assertEqual(200, status)
        self.assertEqual("cinnamoroll", settings["theme"])
        self.assertEqual(40, settings["allowance_rule"]["amount"])
        self.assertNotIn("hash", json.dumps(settings))

        status, _, granted = self.json_request(
            "POST",
            f"/api/grant?k={key}",
            {
                "pin": "123456",
                "amount": 50,
                "note": "加菜",
                "is_bonus": True,
            },
        )
        self.assertEqual(200, status)
        self.assertEqual(50, granted["amount"])
        self.assertTrue(granted["is_bonus"])
        status, _, ledger = self.json_request(
            "GET",
            f"/api/ledger?k={key}&limit=1",
        )
        self.assertEqual(200, status)
        self.assertEqual([], ledger)
        status, _, state = self.json_request("GET", f"/api/state?k={key}")
        self.assertEqual(200, status)
        self.assertEqual("加菜", state["pending_grants"][0]["note"])
        self.assertTrue(state["pending_grants"][0]["is_bonus"])


class TestQrAndParentExchange(VaultHttpTestCase):
    def test_qr_svg_uses_pages_url_and_requires_personal_key(self):
        pig = self.prepare_full_pigs(150)[0]
        reservation = self.service.reserve_exchange(
            100,
            "買文具",
            [pig["id"]],
            self.now,
        )
        target = (
            f"/api/exchange/qr.svg?k={quote(self.personal)}"
            f"&x={quote(reservation['token'])}"
        )

        status, headers, raw = self.request("GET", target)

        self.assertEqual(200, status)
        self.assertEqual("image/svg+xml", headers["content-type"])
        self.assertIn(b"<svg", raw)
        self.assertEqual("no-store", headers["cache-control"])

    def test_parent_resolve_and_approve_need_token_and_pin_not_child_key(self):
        pig = self.prepare_full_pigs(150)[0]
        reservation = self.service.reserve_exchange(
            100,
            "買文具",
            [pig["id"]],
            self.now,
        )

        status, _, resolved = self.json_request(
            "GET",
            f"/api/exchange/resolve?x={quote(reservation['token'])}",
        )
        self.assertEqual(200, status)
        self.assertEqual("pending", resolved["status"])
        self.assertNotIn("pig_ids", resolved)
        self.assertNotIn("token_hash", resolved)

        status, _, bad_pin = self.json_request(
            "POST",
            "/api/exchange/approve",
            {
                "x": reservation["token"],
                "pin": "000000",
                "parent_note": "同意",
            },
        )
        self.assertEqual(401, status)
        self.assertEqual("bad_pin", bad_pin["error"])

        status, _, approved = self.json_request(
            "POST",
            "/api/exchange/approve",
            {
                "x": reservation["token"],
                "pin": "123456",
                "parent_note": "同意",
            },
        )
        self.assertEqual(200, status)
        self.assertEqual("completed", approved["status"])


class TestRequestHardening(VaultHttpTestCase):
    def test_malformed_and_oversize_json_are_rejected(self):
        key = quote(self.personal)
        status, _, malformed = self.json_request(
            "POST",
            f"/api/claim?k={key}",
            b"{",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(400, status)
        self.assertEqual("invalid_json", malformed["error"])

        status, _, oversized = self.json_request(
            "POST",
            f"/api/claim?k={key}",
            b"x" * 65537,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(413, status)
        self.assertEqual("body_too_large", oversized["error"])

    def test_payload_field_types_are_validation_errors(self):
        key = quote(self.personal)
        cases = (
            ("POST", f"/api/claim?k={key}", {"period_key": None}),
            (
                "POST",
                f"/api/exchange/preview?k={key}",
                {"amount": 1, "child_note": "", "pig_ids": "pig"},
            ),
            (
                "POST",
                f"/api/exchange/reserve?k={key}",
                {"amount": 1, "child_note": None, "pig_ids": []},
            ),
            (
                "POST",
                "/api/exchange/approve",
                {"x": 123, "pin": "123456", "parent_note": "同意"},
            ),
            ("POST", f"/api/exchange/cancel?k={key}", {"x": 123}),
            (
                "PUT",
                f"/api/settings/allowance?k={key}",
                {
                    "pin": "123456",
                    "amount": 10,
                    "period": "weekly",
                    "effective_date": self.now.date().isoformat(),
                    "weekday": True,
                    "monthday": None,
                },
            ),
        )

        for method, target, body in cases:
            with self.subTest(method=method, target=target):
                status, _, payload = self.json_request(method, target, body)
                self.assertEqual(400, status)
                self.assertEqual("validation_error", payload["error"])

    def test_cover_and_backdrop_round_trip_to_other_readers(self):
        from io import BytesIO
        from urllib.parse import quote

        from PIL import Image

        def jpeg(color: tuple[int, int, int], size: tuple[int, int]) -> bytes:
            buf = BytesIO()
            Image.new("RGB", size, color).save(buf, "JPEG")
            return buf.getvalue()

        def multipart(name: str, blob: bytes) -> tuple[bytes, str]:
            boundary = "----piggyboundary"
            raw = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{name}.jpg"\r\n'
                "Content-Type: image/jpeg\r\n\r\n"
            ).encode() + blob + f"\r\n--{boundary}--\r\n".encode()
            return raw, f"multipart/form-data; boundary={boundary}"

        missing, _, missing_body = self.request(
            "GET",
            "/cover?k=" + quote(self.personal),
        )
        self.assertEqual(404, missing)
        self.assertIn(b"not_found", missing_body)

        cover_body, cover_type = multipart("cover", jpeg((20, 40, 80), (40, 60)))
        status, _, saved = self.json_request(
            "POST",
            "/api/cover?k=" + quote(self.personal),
            cover_body,
            {"Content-Type": cover_type},
        )
        self.assertEqual(200, status)
        self.assertTrue(saved["has_cover"])
        self.assertGreater(saved["cover_rev"], 0)

        status, headers, raw = self.request(
            "GET",
            "/cover?k=" + quote(self.personal) + "&r=" + str(saved["cover_rev"]),
        )
        self.assertEqual(200, status)
        self.assertTrue(headers["content-type"].startswith("image/jpeg"))
        self.assertTrue(raw.startswith(b"\xff\xd8"))

        backdrop_body, backdrop_type = multipart("backdrop", jpeg((8, 8, 8), (80, 40)))
        status, _, backdrop = self.json_request(
            "POST",
            "/api/backdrop?k=" + quote(self.personal),
            backdrop_body,
            {"Content-Type": backdrop_type},
        )
        self.assertEqual(200, status)
        self.assertTrue(backdrop["has_backdrop"])

        door_status, _, door = self.json_request(
            "GET",
            "/api/door?k=" + quote(self.personal),
        )
        self.assertEqual(200, door_status)
        self.assertTrue(door["reader"]["has_cover"])
        self.assertTrue(door["reader"]["has_backdrop"])
        state_status, _, state = self.json_request(
            "GET",
            "/api/state?k=" + quote(self.personal),
        )
        self.assertEqual(200, state_status)
        self.assertEqual(door["reader"]["cover_rev"], state["cover_rev"])
        self.assertEqual(door["reader"]["backdrop_rev"], state["backdrop_rev"])

    def test_unknown_api_endpoint_is_not_found(self):
        status, _, payload = self.json_request("GET", "/api/unknown")
        self.assertEqual(404, status)
        self.assertEqual("not_found", payload["error"])


class TestCli(unittest.TestCase):
    def test_parser_has_vault_options_and_setup_has_no_pin_option(self):
        parser = cli.build_parser()
        vault = parser.parse_args(["vault"])
        self.assertEqual(("0.0.0.0", 8771), (vault.host, vault.port))
        setup = parser.parse_args(["setup"])
        self.assertEqual("setup", setup.command)
        with (
            patch("sys.stderr", io.StringIO()),
            self.assertRaises(SystemExit),
        ):
            parser.parse_args(["setup", "--pin", "123456"])

    def test_setup_prompts_twice_writes_invite_file_and_prints_only_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "data"
            db_path = data / "piggybank.sqlite3"
            stdout = io.StringIO()
            stderr = io.StringIO()
            with (
                patch.object(cli, "DATA", data),
                patch.object(cli, "DB_PATH", db_path),
                patch.object(cli, "PAGES_BASE", PAGES_BASE),
                patch.object(cli, "getpass", side_effect=["123456", "123456"]),
                patch("sys.stdout", stdout),
                patch("sys.stderr", stderr),
            ):
                result = cli.main(["setup"])

            invite_url = stdout.getvalue().strip()
            self.assertEqual(0, result)
            self.assertEqual("", stderr.getvalue())
            self.assertEqual(
                invite_url,
                (data / "invite-url.txt").read_text(encoding="utf-8").strip(),
            )
            self.assertRegex(
                invite_url,
                rf"^{PAGES_BASE}/hey\.html\?k=[A-Za-z0-9_-]+#k=[A-Za-z0-9_-]+$",
            )
            conn = sqlite3.connect(db_path)
            try:
                settings = dict(conn.execute("SELECT key, value FROM settings"))
            finally:
                conn.close()
            self.assertTrue(verify_pin("123456", settings["parent_pin_hash"]))
            self.assertNotIn("123456", db_path.read_text(errors="ignore"))


if __name__ == "__main__":
    unittest.main()
