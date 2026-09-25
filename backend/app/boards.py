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
# hints unlock with the share of main letters found; keep in step with
# HINT_AT and SHOW_USES_HINT in frontend/src/lib/scoring.ts
HINT_STARTS_AT = 0.3
HINT_REVEAL_AT = 0.6
HINT_USES_AT = 0.75
SHOW_USES_HINT = False

REGULAR_TO_FINAL = str.maketrans("\u05db\u05de\u05e0\u05e4\u05e6", "\u05da\u05dd\u05df\u05e3\u05e5")


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


def reveal_mask(word: str) -> dict:
    """What the reveal hint shows of a word: a few letters at each end.

    Four and five letters give away the first letter only; from six on another
    letter opens at the end, then at the start, and so on (6 -> first and last,
    7 -> first two and last). The middle always stays hidden.
    """
    key = normalize(word)
    n = len(key)
    front = max(1, -(-(n - 4) // 2))
    back = min(max(0, (n - 4) // 2), n - front - 1)   # never give the whole word away
    post = key[n - back:].translate(REGULAR_TO_FINAL) if back else ""
    return {"n": n, "pre": key[:front], "post": post}


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
        """Named only for special shapes (ones with holes)."""
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

    def cell_counts(self, found) -> dict:
        """For each cell, how many main words not found yet start there and pass
        through it. A word counts once per cell however many paths spell it."""
        found = set(found)
        letters, nbrs = self.board.grid, self.nbrs
        starts, uses = [0] * len(letters), [0] * len(letters)

        def walk(key: str, k: int, cell: int, used: list[int], hit: set[int]) -> bool:
            if k == len(key):
                hit.update(used)
                return True
            ok = False
            for n in nbrs[cell]:
                if letters[n] == key[k] and n not in used:
                    used.append(n)
                    ok = walk(key, k + 1, n, used, hit) or ok
                    used.pop()
            return ok

        for w in self.board.main:
            if w in found:
                continue
            key, hit = normalize(w), set()
            for s, ch in enumerate(letters):
                if ch == key[0] and walk(key, 1, s, [s], hit):
                    starts[s] += 1
            for c in hit:
                uses[c] += 1
        return {"starts": starts, "uses": uses}

    def live_cells(self, found) -> dict:
        """Cells some unfound main word still uses, plus the hints the player has
        unlocked: the tile numbers and the part-spelled words still missing.
        `found` comes from the client, so it is checked first: only real main
        words count towards the unlock."""
        words = [f["w"] for f in self.classify(found) if f["cat"] == MAIN]
        total = self.main_letters()
        frac = sum(len(normalize(w)) for w in words) / total if total else 0
        counts = self.cell_counts(words)
        out: dict = {"cells": [c for c, n in enumerate(counts["uses"]) if n]}
        if frac >= HINT_STARTS_AT:
            out["starts"] = counts["starts"]
        if frac >= HINT_REVEAL_AT:
            got = set(words)
            out["reveals"] = [reveal_mask(w) for w in self.board.main if w not in got]
        if SHOW_USES_HINT and frac >= HINT_USES_AT:
            out["uses"] = counts["uses"]
        return out
