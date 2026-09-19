"""Stored boards, and what of them the player may see.

The public view never includes the word lists: words are checked on the
server (`check_path`), and the client only learns a word once it finds it.
"""

from __future__ import annotations

import json
from datetime import date as Date
from functools import lru_cache
from pathlib import Path

from wordgame import BONUS, MAIN, Board, is_valid_path, neighbors, normalize, word_points

from . import config

MIN_LEN = 4
MAX_GROUP = 8          # words of 8+ letters share one group


class BoardNotFound(Exception):
    pass


@lru_cache(maxsize=1)
def _shape_titles() -> dict[str, str]:
    if not config.SHAPES_FILE.exists():
        return {}
    shapes = json.loads(config.SHAPES_FILE.read_text(encoding="utf-8"))
    return {name: s.get("title", "") for name, s in shapes.items() if isinstance(s, dict)}


@lru_cache(maxsize=512)
def _load(path: Path, mtime: float) -> "Day":
    return Day(Board.from_json(json.loads(path.read_text(encoding="utf-8"))))


def all_dates() -> list[str]:
    return sorted(f.stem for f in config.BOARDS_DIR.glob("*.json"))


def playable_dates() -> list[str]:
    """Days up to today (Israel time); future boards stay hidden."""
    dates = all_dates()
    today = config.today()
    playable = [d for d in dates if d <= today]
    return playable or dates[:1]


def get_day(date: str) -> "Day":
    if date not in playable_dates():
        raise BoardNotFound(date)
    return load_day(date)


def load_day(date: str) -> "Day":
    """No playability check: for dates that came from `playable_dates()`."""
    path = config.BOARDS_DIR / f"{date}.json"
    return _load(path, path.stat().st_mtime)


def day_number(date: str, epoch: str | None = None) -> int:
    """Day 1 is the first stored board; pass `epoch` to skip listing the boards."""
    first = Date.fromisoformat(epoch or all_dates()[0])
    return (Date.fromisoformat(date) - first).days + 1


def group_of(word: str) -> int:
    return min(len(normalize(word)), MAX_GROUP)


class Day:
    """One board plus the indexes needed to answer the player."""

    def __init__(self, board: Board):
        self.board = board
        self.nbrs = neighbors(board.shape)
        self.index: dict[str, tuple[str, str]] = {normalize(w): (BONUS, w) for w in board.bonus}
        self.index.update({normalize(w): (MAIN, w) for w in board.main})
        self.theme_words = set((board.theme or {}).get("words", []))

    @property
    def date(self) -> str:
        return self.board.date

    @property
    def shape_title(self) -> str:
        """Named only for special shapes (ones with holes), as build_web.py does."""
        shape = self.board.shape
        if all(set(row) == {"X"} for row in shape.mask):
            return ""
        return _shape_titles().get(shape.name, "")

    def main_letters(self) -> int:
        return sum(len(normalize(w)) for w in self.board.main)

    def summary(self, epoch: str | None = None) -> dict:
        """What the archive list shows for this day."""
        b = self.board
        return {
            "date": b.date,
            "number": day_number(b.date, epoch),
            "shapeName": self.shape_title,
            "theme": b.theme["title"] if b.theme else None,
            "mainTotal": len(b.main),
            "mainLetters": self.main_letters(),
        }

    def public(self) -> dict:
        """The board as the player gets it: letters and counts, no words."""
        groups: dict[int, int] = {}
        for w in self.board.main:
            groups[group_of(w)] = groups.get(group_of(w), 0) + 1
        return {
            **self.summary(),
            "letters": "".join(self.board.grid),
            "mask": list(self.board.shape.mask),
            "groups": [{"length": n, "total": groups[n]} for n in sorted(groups)],
            "bonusTotal": len(self.board.bonus),
            "themeTotal": len(self.theme_words),
        }

    def check_path(self, path: list[int]) -> dict:
        """The player swiped over these cells (in the board's own cell order)."""
        if not is_valid_path(path, self.board.shape):
            return {"status": "bad_path"}
        return self.check_key("".join(self.board.grid[c] for c in path))

    def check_key(self, key: str) -> dict:
        if len(key) < MIN_LEN:
            return {"status": "too_short"}
        hit = self.index.get(key)
        if hit is None:
            return {"status": "not_a_word"}
        category, word = hit
        return {"status": category, "word": word, "points": word_points(word, category),
                "theme": word in self.theme_words}

    def classify(self, words) -> list[dict]:
        """Keep only real words of this board, each with its category (drops junk and repeats)."""
        out, seen = [], set()
        for w in words:
            r = self.check_key(normalize(w))
            if r["status"] in (MAIN, BONUS) and r["word"] not in seen:
                seen.add(r["word"])
                out.append({"w": r["word"], "cat": r["status"], "theme": r["theme"]})
        return out

    def live_cells(self, found) -> list[int]:
        """Cells that some main word not found yet still passes through."""
        found = set(found)
        letters, nbrs = self.board.grid, self.nbrs
        live: set[int] = set()

        def walk(key: str, k: int, cell: int, used: list[int]) -> None:
            if k == len(key):
                live.update(used)
                return
            for n in nbrs[cell]:
                if letters[n] == key[k] and n not in used:
                    used.append(n)
                    walk(key, k + 1, n, used)
                    used.pop()

        for w in self.board.main:
            if w in found:
                continue
            key = normalize(w)
            for s, ch in enumerate(letters):
                if ch == key[0]:
                    walk(key, 1, s, [s])
        return sorted(live)
