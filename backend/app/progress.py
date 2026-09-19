"""Player progress in SQLite, keyed by player id.

Today the id is an anonymous one the browser makes up (X-Player-Id). When
login arrives, `deps.current_player` returns the user's id instead and this
module stays as it is.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Callable

SCHEMA = """
CREATE TABLE IF NOT EXISTS progress (
    player_id  TEXT NOT NULL,
    date       TEXT NOT NULL,
    found      TEXT NOT NULL DEFAULT '[]',   -- JSON [{w, cat, theme}] in the order found
    rot        INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, date)
);
"""


class ProgressRepo:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._tx() as db:
            db.executescript(SCHEMA)

    @contextmanager
    def _tx(self):
        with self._lock, self._db:
            yield self._db

    def get(self, player: str, date: str) -> dict | None:
        with self._tx() as db:
            return self._get(db, player, date)

    def all(self, player: str) -> dict[str, dict]:
        with self._tx() as db:
            rows = db.execute("SELECT date, found, rot FROM progress WHERE player_id = ?",
                              (player,)).fetchall()
        return {r["date"]: {"found": json.loads(r["found"]), "rot": r["rot"]} for r in rows}

    def put(self, player: str, date: str, found: list[dict], rot: int) -> None:
        with self._tx() as db:
            self._put(db, player, date, found, rot)

    def update(self, player: str, date: str,
               change: Callable[[dict | None], dict]) -> dict:
        """Read, change and write back one row under the lock, so two saves at
        once can't both read the old row and the later write drop the other's words.
        `change` gets the stored {found, rot} (or None) and returns the new one."""
        with self._tx() as db:
            new = change(self._get(db, player, date))
            self._put(db, player, date, new["found"], new["rot"])
        return new

    @staticmethod
    def _get(db: sqlite3.Connection, player: str, date: str) -> dict | None:
        row = db.execute("SELECT found, rot FROM progress WHERE player_id = ? AND date = ?",
                         (player, date)).fetchone()
        return {"found": json.loads(row["found"]), "rot": row["rot"]} if row else None

    @staticmethod
    def _put(db: sqlite3.Connection, player: str, date: str, found: list[dict], rot: int) -> None:
        db.execute(
            """INSERT INTO progress (player_id, date, found, rot) VALUES (?, ?, ?, ?)
               ON CONFLICT (player_id, date) DO UPDATE SET
                 found = excluded.found, rot = excluded.rot, updated_at = datetime('now')""",
            (player, date, json.dumps(found, ensure_ascii=False), rot))
