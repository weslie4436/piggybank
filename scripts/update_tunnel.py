# -*- coding: utf-8 -*-
"""Write the current Cloudflare tunnel origin into web/config.js."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "web" / "config.js"
ORIGIN_RE = re.compile(r'(window\.VAULT_ORIGIN\s*=\s*")([^"]*)(")')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    if origin and not origin.startswith("https://"):
        raise SystemExit("origin must be https")
    text = CONFIG.read_text(encoding="utf-8")
    if not ORIGIN_RE.search(text):
        raise SystemExit("VAULT_ORIGIN assignment missing")
    CONFIG.write_text(ORIGIN_RE.sub(rf"\g<1>{origin}\g<3>", text), encoding="utf-8")
    print(origin)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
