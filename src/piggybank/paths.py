"""Repository and runtime path configuration."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WEB = ROOT / "web"
DATA = Path(os.environ["PIGGYBANK_DATA"]) if "PIGGYBANK_DATA" in os.environ else ROOT / "data"
DB_PATH = DATA / "piggybank.sqlite3"
PORT = int(os.environ["PIGGYBANK_PORT"]) if "PIGGYBANK_PORT" in os.environ else 8771
PAGES_BASE = (
    os.environ["PIGGYBANK_PAGES_BASE"]
    if "PIGGYBANK_PAGES_BASE" in os.environ
    else "https://theoldfathertw.github.io/piggybank"
)
