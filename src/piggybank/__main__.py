"""Command-line entry point for `python -m piggybank`."""

from __future__ import annotations

import argparse
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="piggybank")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("vault")
    subparsers.add_parser("setup")
    subparsers.add_parser("ensure-shortcut")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    print(f"尚未實作：{args.command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
