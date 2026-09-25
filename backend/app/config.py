"""Paths and settings, all overridable from the environment (see docker-compose.yml)."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# The repo root holds wordgame.py, boards/ and shapes.json.
REPO_ROOT = Path(os.environ.get("RIBUON_ROOT", Path(__file__).resolve().parents[2]))
BOARDS_DIR = Path(os.environ.get("RIBUON_BOARDS", REPO_ROOT / "boards" / "daily"))
SHAPES_FILE = REPO_ROOT / "shapes.json"
DB_PATH = Path(os.environ.get("RIBUON_DB", REPO_ROOT / "backend" / "ribuon.db"))
CORS_ORIGINS = [o for o in os.environ.get("RIBUON_CORS", "").split(",") if o]

ISRAEL = ZoneInfo("Asia/Jerusalem")


def today() -> str:
    """Today's date in Israel. RIBUON_TODAY pins it (handy for testing future boards)."""
    return os.environ.get("RIBUON_TODAY") or datetime.now(ISRAEL).date().isoformat()
