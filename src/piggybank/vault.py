"""Local HTTP vault for the PiggyBank Pages client."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from piggybank.keys import VaultKeys
from piggybank.paths import DATA
from piggybank.qr import qr_svg
from piggybank.schedule import TAIPEI
from piggybank.service import DomainError, PiggyService
from piggybank.store import Store

_MAX_BODY = 64 * 1024
_LOCAL_ORIGIN = re.compile(r"^http://(?:127\.0\.0\.1|localhost):([0-9]+)$")
_STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


class _HttpError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def _domain_status(error: DomainError) -> int:
    if error.code in {"bad_pin", "invalid_invite"}:
        return 401
    if error.code == "pin_locked":
        return 423
    if error.code.endswith("_not_found"):
        return 404
    return 409


def make_server(
    host: str,
    port: int,
    store: Store,
    web_root: Path,
    pages_base: str,
) -> ThreadingHTTPServer:
    service = PiggyService(store)
    keys = VaultKeys(store)
    root = web_root.resolve()
    pages = pages_base.rstrip("/")
    parsed_pages = urlsplit(pages)
    pages_origin = f"{parsed_pages.scheme}://{parsed_pages.netloc}"

    class VaultHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args) -> None:
            return

        def _path(self) -> str:
            return urlsplit(self.path).path

        def _query(self, name: str) -> str:
            values = parse_qs(
                urlsplit(self.path).query,
                keep_blank_values=True,
            ).get(name, [])
            if len(values) != 1 or not values[0]:
                raise ValueError(f"{name} is required")
            return values[0]

        def _cors_origin(self) -> str | None:
            origin = self.headers.get("Origin")
            if origin is None:
                return None
            if origin == pages_origin:
                return origin
            match = _LOCAL_ORIGIN.fullmatch(origin)
            if match is not None and 0 <= int(match.group(1)) <= 65535:
                return origin
            raise _HttpError(
                403,
                "cors_forbidden",
                "不允許這個網頁來源",
            )

        def _send_bytes(
            self,
            status: int,
            body: bytes,
            content_type: str,
            cors_origin: str | None = None,
        ) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if cors_origin is not None:
                self.send_header("Access-Control-Allow-Origin", cors_origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            if self.command != "HEAD" and body:
                self.wfile.write(body)

        def _send_json(
            self,
            status: int,
            payload,
            cors_origin: str | None = None,
        ) -> None:
            body = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
            self._send_bytes(
                status,
                body,
                "application/json; charset=utf-8",
                cors_origin,
            )

        def _send_error_json(
            self,
            status: int,
            code: str,
            message: str,
            cors_origin: str | None = None,
        ) -> None:
            self._send_json(
                status,
                {"error": code, "message": message},
                cors_origin,
            )

        def _read_json(self) -> dict:
            raw_length = self.headers.get("Content-Length", "0")
            try:
                length = int(raw_length)
            except ValueError as error:
                raise _HttpError(
                    400,
                    "invalid_json",
                    "JSON 格式不正確",
                ) from error
            if length < 0:
                raise _HttpError(
                    400,
                    "invalid_json",
                    "JSON 格式不正確",
                )
            if length > _MAX_BODY:
                self.close_connection = True
                raise _HttpError(
                    413,
                    "body_too_large",
                    "請求內容超過 64 KiB",
                )
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise _HttpError(
                    400,
                    "invalid_json",
                    "JSON 格式不正確",
                ) from error
            if not isinstance(payload, dict):
                raise _HttpError(
                    400,
                    "invalid_json",
                    "JSON 必須是物件",
                )
            return payload

        @staticmethod
        def _field(payload: dict, name: str):
            if name not in payload:
                raise ValueError(f"{name} is required")
            return payload[name]

        @classmethod
        def _string_field(cls, payload: dict, name: str) -> str:
            value = cls._field(payload, name)
            if not isinstance(value, str):
                raise ValueError(f"{name} must be a string")
            return value

        @classmethod
        def _integer_field(cls, payload: dict, name: str) -> int:
            value = cls._field(payload, name)
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"{name} must be an integer")
            return value

        @classmethod
        def _optional_integer_field(
            cls,
            payload: dict,
            name: str,
        ) -> int | None:
            value = cls._field(payload, name)
            if value is None:
                return None
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"{name} must be an integer or null")
            return value

        @classmethod
        def _string_list_field(
            cls,
            payload: dict,
            name: str,
        ) -> list[str]:
            value = cls._field(payload, name)
            if (
                not isinstance(value, list)
                or any(not isinstance(item, str) for item in value)
            ):
                raise ValueError(f"{name} must be a list of strings")
            return value

        def _require_personal(self) -> str:
            try:
                token = self._query("k")
            except ValueError as error:
                raise _HttpError(
                    401,
                    "unauthorized",
                    "需要個人入口鑰匙",
                ) from error
            door = keys.door_for(token)
            if door is None or door.get("kind") != "personal":
                raise _HttpError(
                    401,
                    "unauthorized",
                    "需要個人入口鑰匙",
                )
            return token

        def _dispatch_get(self, path: str):
            if path == "/api/health":
                return {"ok": True}
            if path == "/api/door":
                try:
                    token = self._query("k")
                except ValueError as error:
                    raise _HttpError(
                        401,
                        "unauthorized",
                        "入口鑰匙無效",
                    ) from error
                door = keys.door_for(token)
                if door is None:
                    raise _HttpError(
                        401,
                        "unauthorized",
                        "入口鑰匙無效",
                    )
                return door
            if path == "/api/exchange/resolve":
                return service.resolve_exchange(
                    self._query("x"),
                    datetime.now(TAIPEI),
                )

            if path == "/api/state":
                self._require_personal()
                return service.state(datetime.now(TAIPEI))
            if path == "/api/ledger":
                self._require_personal()
                query = parse_qs(
                    urlsplit(self.path).query,
                    keep_blank_values=True,
                )
                raw_limit = query.get("limit", ["50"])
                if len(raw_limit) != 1:
                    raise ValueError("limit must appear once")
                try:
                    limit = int(raw_limit[0])
                except ValueError as error:
                    raise ValueError(
                        "limit must be between 1 and 100"
                    ) from error
                raw_before = query.get("before")
                if raw_before is not None and len(raw_before) != 1:
                    raise ValueError("before must appear once")
                before = raw_before[0] if raw_before is not None else None
                return service.ledger(limit=limit, before=before)
            if path == "/api/exchange/status":
                self._require_personal()
                return service.exchange_status(
                    self._query("id"),
                    datetime.now(TAIPEI),
                )
            if path == "/api/exchange/qr.svg":
                self._require_personal()
                token = self._query("x")
                qr_url = f"{pages}/exchange.html?x={quote(token, safe='')}"
                return qr_svg(qr_url)
            raise _HttpError(404, "not_found", "找不到這個 API")

        def _dispatch_post(self, path: str):
            if path == "/api/join":
                try:
                    invite = self._query("k")
                except ValueError as error:
                    raise _HttpError(
                        401,
                        "invalid_invite",
                        "邀請連結無效或已使用",
                    ) from error
                payload = self._read_json()
                result = keys.join(
                    invite,
                    self._string_field(payload, "display_name"),
                )
                token = result["token"]
                url = (
                    f"{pages}/index.html?k={quote(token, safe='')}"
                    f"#k={quote(token, safe='')}"
                )
                DATA.mkdir(parents=True, exist_ok=True)
                (DATA / "personal-url.txt").write_text(
                    f"{url}\n",
                    encoding="utf-8",
                )
                return {
                    **result,
                    "url": url,
                }
            if path == "/api/exchange/approve":
                payload = self._read_json()
                return service.approve_exchange(
                    self._string_field(payload, "x"),
                    self._string_field(payload, "pin"),
                    self._string_field(payload, "parent_note"),
                    datetime.now(TAIPEI),
                )

            if path == "/api/claim":
                self._require_personal()
                payload = self._read_json()
                return service.claim(
                    self._string_field(payload, "period_key"),
                    datetime.now(TAIPEI),
                )
            if path == "/api/debug/feed":
                self._require_personal()
                self._read_json()
                return service.debug_feed(datetime.now(TAIPEI))
            if path == "/api/harvest/pig":
                self._require_personal()
                payload = self._read_json()
                return service.harvest_pig(
                    self._string_field(payload, "pig_id"),
                    datetime.now(TAIPEI),
                )
            if path == "/api/exchange/preview":
                self._require_personal()
                payload = self._read_json()
                return service.preview_exchange(
                    self._integer_field(payload, "amount"),
                    self._string_list_field(payload, "pig_ids"),
                    datetime.now(TAIPEI),
                )
            if path == "/api/exchange/reserve":
                self._require_personal()
                payload = self._read_json()
                result = service.reserve_exchange(
                    self._integer_field(payload, "amount"),
                    self._string_field(payload, "child_note"),
                    self._string_list_field(payload, "pig_ids"),
                    datetime.now(TAIPEI),
                )
                token = result["token"]
                return {
                    **result,
                    "qr_url": (
                        f"{pages}/exchange.html?x={quote(token, safe='')}"
                    ),
                }
            if path == "/api/exchange/cancel":
                self._require_personal()
                payload = self._read_json()
                return service.cancel_exchange(
                    self._string_field(payload, "x"),
                    datetime.now(TAIPEI),
                )
            if path == "/api/settings/read":
                self._require_personal()
                payload = self._read_json()
                return service.parent_settings(
                    self._string_field(payload, "pin"),
                    datetime.now(TAIPEI),
                )
            raise _HttpError(404, "not_found", "找不到這個 API")

        def _dispatch_put(self, path: str):
            if path == "/api/settings/allowance":
                self._require_personal()
                payload = self._read_json()
                now = datetime.now(TAIPEI)
                service.authorize_parent(
                    self._string_field(payload, "pin"),
                    now,
                )
                effective_date = date.fromisoformat(
                    self._string_field(payload, "effective_date")
                )
                rule_id = service.set_allowance(
                    self._integer_field(payload, "amount"),
                    self._string_field(payload, "period"),
                    effective_date,
                    now,
                    weekday=self._optional_integer_field(
                        payload,
                        "weekday",
                    ),
                    monthday=self._optional_integer_field(
                        payload,
                        "monthday",
                    ),
                )
                return {
                    "id": rule_id,
                    "revision": store.snapshot()["revision"],
                }
            if path == "/api/settings/theme":
                self._require_personal()
                payload = self._read_json()
                return service.set_theme(
                    self._string_field(payload, "theme"),
                    self._string_field(payload, "pin"),
                    datetime.now(TAIPEI),
                )
            raise _HttpError(404, "not_found", "找不到這個 API")

        def _handle_api(self) -> None:
            cors_origin = None
            try:
                cors_origin = self._cors_origin()
                path = self._path()
                if self.command == "GET":
                    result = self._dispatch_get(path)
                elif self.command == "POST":
                    result = self._dispatch_post(path)
                elif self.command == "PUT":
                    result = self._dispatch_put(path)
                else:
                    raise _HttpError(
                        405,
                        "method_not_allowed",
                        "不支援這個請求方法",
                    )
                if isinstance(result, bytes):
                    self._send_bytes(
                        200,
                        result,
                        "image/svg+xml",
                        cors_origin,
                    )
                else:
                    self._send_json(200, result, cors_origin)
            except _HttpError as error:
                self._send_error_json(
                    error.status,
                    error.code,
                    str(error),
                    cors_origin,
                )
            except DomainError as error:
                self._send_error_json(
                    _domain_status(error),
                    error.code,
                    str(error),
                    cors_origin,
                )
            except (TypeError, ValueError) as error:
                self._send_error_json(
                    400,
                    "validation_error",
                    str(error),
                    cors_origin,
                )
            except Exception:
                self._send_error_json(
                    500,
                    "internal_error",
                    "保險庫暫時無法完成請求",
                    cors_origin,
                )

        def _serve_static(self) -> None:
            try:
                decoded = unquote(self._path())
                relative = "index.html" if decoded == "/" else decoded.lstrip("/")
                candidate = (root / relative).resolve()
                candidate.relative_to(root)
                content_type = _STATIC_TYPES.get(candidate.suffix.lower())
                if content_type is None or not candidate.is_file():
                    raise FileNotFoundError
                self._send_bytes(
                    200,
                    candidate.read_bytes(),
                    content_type,
                )
            except (FileNotFoundError, OSError, ValueError):
                self._send_error_json(
                    404,
                    "not_found",
                    "找不到這個檔案",
                )

        def do_OPTIONS(self) -> None:
            if not self._path().startswith("/api/"):
                self._send_error_json(404, "not_found", "找不到這個 API")
                return
            cors_origin = None
            try:
                cors_origin = self._cors_origin()
            except _HttpError as error:
                self._send_error_json(
                    error.status,
                    error.code,
                    str(error),
                )
                return
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.send_header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT",
            )
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type",
            )
            self.send_header("Access-Control-Max-Age", "600")
            if cors_origin is not None:
                self.send_header(
                    "Access-Control-Allow-Origin",
                    cors_origin,
                )
                self.send_header("Vary", "Origin")
            self.end_headers()

        def do_GET(self) -> None:
            if self._path().startswith("/api/"):
                self._handle_api()
            else:
                self._serve_static()

        def do_POST(self) -> None:
            if self._path().startswith("/api/"):
                self._handle_api()
            else:
                self._send_error_json(
                    405,
                    "method_not_allowed",
                    "不支援這個請求方法",
                )

        def do_PUT(self) -> None:
            if self._path().startswith("/api/"):
                self._handle_api()
            else:
                self._send_error_json(
                    405,
                    "method_not_allowed",
                    "不支援這個請求方法",
                )

    return ThreadingHTTPServer((host, port), VaultHandler)
