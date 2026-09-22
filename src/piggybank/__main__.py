"""Command-line entry point for `python -m piggybank`."""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from getpass import getpass
from urllib.parse import parse_qs, quote, unquote, urlsplit

from piggybank.keys import VaultKeys
from piggybank.paths import DATA, DB_PATH, PAGES_BASE, PORT, ROOT, WEB
from piggybank.schedule import TAIPEI
from piggybank.service import DomainError, PiggyService
from piggybank.store import Store
from piggybank.vault import make_server


def personal_page_url(token: str) -> str:
    encoded = quote(token, safe="")
    return (
        f"{PAGES_BASE.rstrip('/')}/index.html?k={encoded}#k={encoded}"
    )


def invite_page_url(token: str) -> str:
    encoded = quote(token, safe="")
    return f"{PAGES_BASE.rstrip('/')}/hey.html?k={encoded}#k={encoded}"


def token_from_page_url(url: str) -> str:
    text = (url or "").strip()
    if not text:
        return ""
    parts = urlsplit(text)
    query = parse_qs(parts.query)
    if query.get("k"):
        return query["k"][0]
    fragment = parts.fragment or ""
    if fragment.startswith("k="):
        return unquote(fragment[2:].split("&", 1)[0].replace("+", " "))
    hashed = parse_qs(fragment)
    if hashed.get("k"):
        return hashed["k"][0]
    return ""


def write_invite_url(token: str) -> str:
    url = invite_page_url(token)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "invite-url.txt").write_text(f"{url}\n", encoding="utf-8")
    return url


def write_personal_url(token: str) -> str:
    url = personal_page_url(token)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "personal-url.txt").write_text(f"{url}\n", encoding="utf-8")
    return url


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="piggybank")
    subparsers = parser.add_subparsers(dest="command", required=True)
    vault = subparsers.add_parser("vault")
    vault.add_argument("--host", default="0.0.0.0")
    vault.add_argument("--port", type=int, default=PORT)
    subparsers.add_parser("setup")
    subparsers.add_parser("ensure-shortcut")
    subparsers.add_parser(
        "invite-url",
        help="印出邀請頁網址；若沒有有效入口鑰匙就發一把新的",
    )
    subparsers.add_parser(
        "personal-url",
        help="印出個人頁鑰匙網址；若遺失則補發新鑰匙",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "vault":
        store = Store(DB_PATH)
        PiggyService(store).initialize(datetime.now(TAIPEI))
        server = make_server(
            args.host,
            args.port,
            store,
            WEB,
            PAGES_BASE,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0

    if args.command == "setup":
        pin = getpass("請輸入六位數家長 PIN：")
        confirmation = getpass("請再輸入一次家長 PIN：")
        if pin != confirmation:
            print("兩次輸入的 PIN 不一致", file=sys.stderr)
            return 2
        store = Store(DB_PATH)
        service = PiggyService(store)
        now = datetime.now(TAIPEI)
        try:
            service.initialize(now)
            service.set_parent_pin(pin, now)
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 2
        print(write_invite_url(VaultKeys(store).create_invite()))
        return 0

    if args.command == "invite-url":
        DATA.mkdir(parents=True, exist_ok=True)
        store = Store(DB_PATH)
        keys = VaultKeys(store)
        saved = DATA / "invite-url.txt"
        if saved.is_file():
            token = token_from_page_url(saved.read_text(encoding="utf-8"))
            door = keys.door_for(token) if token else None
            if door and door.get("kind") == "invite":
                print(write_invite_url(token))
                return 0
        print(write_invite_url(keys.create_invite()))
        return 0

    if args.command == "personal-url":
        DATA.mkdir(parents=True, exist_ok=True)
        saved = DATA / "personal-url.txt"
        if saved.is_file():
            print(saved.read_text(encoding="utf-8").strip())
            return 0
        store = Store(DB_PATH)
        try:
            result = VaultKeys(store).reissue_personal()
        except DomainError as error:
            invite = DATA / "invite-url.txt"
            if invite.is_file():
                print(
                    "還沒完成綁定。請用手機 Safari 開：",
                    invite.read_text(encoding="utf-8").strip(),
                    sep="\n",
                    file=sys.stderr,
                )
            else:
                print(str(error), file=sys.stderr)
            return 2
        url = write_personal_url(result["token"])
        print(url)
        return 0

    script = ROOT / "scripts" / "ensure_shortcut.ps1"
    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
        ],
        check=False,
    )
    return int(completed.returncode)


if __name__ == "__main__":
    sys.exit(main())
