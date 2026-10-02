"""Player progress in SQLite, keyed by player id.

The id is either an anonymous one the browser makes up (X-Player-Id) or, for a
logged-in player, `user:<id>` (see `deps.current_player`). Logging in moves the
anonymous rows onto the user (`move`).

`on_day` keeps what each player had found on a board's own day (Israel time),
for the leaderboard: play from the archive on later days never reaches it, so
it can't lift a day's ranking or fill in a streak.
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
CREATE TABLE IF NOT EXISTS on_day (
    player_id  TEXT NOT NULL,
    date       TEXT NOT NULL,
    main       INTEGER NOT NULL,             -- main words found by the end of that day
    letters    INTEGER NOT NULL DEFAULT 0,   -- their letters (the progress bar's measure)
    bonus      INTEGER NOT NULL,
    done_at    TEXT,                         -- when the last main word was found, if it was that day
    PRIMARY KEY (player_id, date)
);
CREATE INDEX IF NOT EXISTS on_day_date ON on_day(date);
"""

# found only grows, so a newer save never lowers a count; the first finish stays
_ON_DAY_UPSERT = """
INSERT INTO on_day (player_id, date, main, letters, bonus, done_at) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (player_id, date) DO UPDATE SET
  main = max(main, excluded.main), letters = max(letters, excluded.letters), bonus = max(bonus, excluded.bonus),
  done_at = CASE WHEN on_day.done_at IS NULL OR excluded.done_at < on_day.done_at
                 THEN excluded.done_at ELSE on_day.done_at END
"""


class ProgressRepo:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, timeout=10)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._tx() as db:
            db.executescript(SCHEMA)
            if "letters" not in {r["name"] for r in db.execute("PRAGMA table_info(on_day)")}:
                db.execute("ALTER TABLE on_day ADD COLUMN letters INTEGER NOT NULL DEFAULT 0")

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

    def move(self, src: str, dst: str,
             merge: Callable[[str, dict, dict | None], dict]) -> list[str]:
        """Hand every day of player `src` to `dst` and drop `src`, in one transaction.
        `merge(date, src_row, dst_row_or_None)` gives the day's new {found, rot}.
        Returns the dates moved."""
        with self._tx() as db:
            dates = [r["date"] for r in db.execute("SELECT date FROM progress WHERE player_id = ?", (src,))]
            for date in dates:
                new = merge(date, self._get(db, src, date), self._get(db, dst, date))
                self._put(db, dst, date, new["found"], new["rot"])
            db.execute("DELETE FROM progress WHERE player_id = ?", (src,))
            for r in db.execute("SELECT * FROM on_day WHERE player_id = ?", (src,)).fetchall():
                db.execute(_ON_DAY_UPSERT, (dst, r["date"], r["main"], r["letters"], r["bonus"], r["done_at"]))
            db.execute("DELETE FROM on_day WHERE player_id = ?", (src,))
        return dates

    def delete_player(self, player: str) -> None:
        with self._tx() as db:
            db.execute("DELETE FROM progress WHERE player_id = ?", (player,))
            db.execute("DELETE FROM on_day WHERE player_id = ?", (player,))

    # --- the leaderboard -------------------------------------------------------

    def record_on_day(self, player: str, date: str, main: int, bonus: int, done: bool, letters: int = 0) -> None:
        """What `player` has on `date`, saved on that very day."""
        with self._tx() as db:
            done_at = db.execute("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").fetchone()[0] if done else None
            db.execute(_ON_DAY_UPSERT, (player, date, main, letters, bonus, done_at))

    def day_totals(self, date: str) -> dict:
        """Over everyone who found a main word on `date`, that day: how many, and
        their average words and letters."""
        with self._tx() as db:
            r = db.execute("SELECT COUNT(*) n, AVG(main) words, AVG(letters) letters "
                           "FROM on_day WHERE date = ? AND main > 0", (date,)).fetchone()
        return {"players": r["n"], "words": r["words"] or 0, "letters": r["letters"] or 0}

    def on_day(self, date: str) -> list[dict]:
        """Every player's row for `date`."""
        with self._tx() as db:
            rows = db.execute("SELECT player_id, main, bonus, done_at FROM on_day WHERE date = ? AND main > 0",
                              (date,)).fetchall()
        return [dict(r) for r in rows]

    def days_played(self, players: list[str]) -> dict[str, set[str]]:
        """For each of `players`, the dates they found a main word on the day itself."""
        out: dict[str, set[str]] = {p: set() for p in players}
        with self._tx() as db:
            for i in range(0, len(players), 500):       # SQLite caps the parameters of one query
                chunk = players[i:i + 500]
                for r in db.execute(f"SELECT player_id, date FROM on_day WHERE main > 0 AND player_id IN "
                                    f"({','.join('?' * len(chunk))})", chunk):
                    out[r["player_id"]].add(r["date"])
        return out

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
