"""The hints a board hands out. From backend/, with the repo root on the path:

    python -m unittest tests.test_boards -v
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.boards import Day, group_of
from wordgame import Board, normalize

BOARD = Path(__file__).resolve().parents[2] / "boards" / "daily" / "2026-09-03.json"


class TestRevealOrder(unittest.TestCase):
    def setUp(self):
        self.day = Day(Board.from_json(json.loads(BOARD.read_text(encoding="utf-8"))))
        self.main = list(self.day.board.main)

    def reveals(self, missing: list[str]) -> dict[str, dict]:
        """The slots handed out with every main word found but `missing`,
        keyed by the word each stands for (they come in board order)."""
        found = [w for w in self.main if w not in missing]
        out = self.day.live_cells(found)["reveals"]
        self.assertEqual(len(out), len(missing))
        return dict(zip([w for w in self.main if w in missing], out))

    def rank(self, word: str) -> int:
        """Where the word falls in the a-b order of its group's main words."""
        keys = sorted(normalize(w) for w in self.main if group_of(w) == group_of(word))
        return keys.index(normalize(word))

    def test_at_is_the_words_place_in_its_group(self):
        missing = self.main[::3]
        for w, r in self.reveals(missing).items():
            with self.subTest(word=w):
                self.assertEqual(r["at"], self.rank(w))
                key = normalize(w)
                self.assertEqual(r["n"], len(key))
                self.assertTrue(key.startswith(r["pre"]))

    def test_at_counts_found_words_too(self):
        # the place is in the whole group, so it does not move as words are found
        w = self.main[0]
        few = self.reveals(self.main[:len(self.main) // 3])[w]["at"]
        one = self.reveals([w])[w]["at"]
        self.assertEqual(few, one)
        self.assertEqual(one, self.rank(w))

    def test_slots_that_spell_the_same_get_their_own_places(self):
        # the board has look-alike slots in some group: each still has its own `at`
        slots = self.reveals(self.main[::3])
        seen: dict[tuple, set[int]] = {}
        for r in slots.values():
            seen.setdefault((r["n"], r["pre"], r["post"]), set()).add(r["at"])
        for look, places in seen.items():
            with self.subTest(slot=look):
                self.assertEqual(len(places), sum((s["n"], s["pre"], s["post"]) == look for s in slots.values()))


if __name__ == "__main__":
    unittest.main()
