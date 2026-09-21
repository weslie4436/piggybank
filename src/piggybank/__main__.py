"""Command-line entry point for `python -m piggybank`."""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from getpass import getpass
from urllib.parse import quote

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
    setup = subparsers.add_parser("setup")
    setup.add_argument("--name", required=True)
    subparsers.add_parser("ensure-shortcut")
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
        name = args.name.strip()
        if not 1 <= len(name) <= 20:
            print("孩子名字必須是 1 到 20 個字", file=sys.stderr)
            return 2
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
        invite = VaultKeys(store).create_invite()
        encoded = quote(invite, safe="")
        url = f"{PAGES_BASE.rstrip('/')}/index.html?k={encoded}#k={encoded}"
        DATA.mkdir(parents=True, exist_ok=True)
        (DATA / "invite-url.txt").write_text(
            f"{url}\n",
            encoding="utf-8",
        )
        print(url)
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
