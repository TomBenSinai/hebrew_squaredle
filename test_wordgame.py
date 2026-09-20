"""Run: python -m unittest test_wordgame -v   (standard library only)"""

import random
import unittest
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from dataclasses import replace

from wordgame import (BLOCKED, BONUS, MAIN, PRESETS, Board, Game, Lexicon, Settings, Shape,
                      Theme, daily_board, is_valid_path, main_cells, neighbors, normalize, preset,
                      settings_for, solve, word_points)
from wordgame import _long_targets, _relax

DATA = Path(__file__).parent / "data"
LEX = Lexicon.load(DATA)
SIZES = (4, 5)          # sizes that get the full generation checks


def all_words():
    out = {}
    for name, cat in (("bonus.txt", BONUS), ("main.txt", MAIN), ("blocklist.txt", BLOCKED),
                      ("blocked_forms.txt", BLOCKED)):
        if not (DATA / name).exists():
            continue
        for line in (DATA / name).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                out[line.split("\t")[0]] = cat
    return out


WORDS = all_words()


def brute_force_in_grid(grid, word, size):
    """Independent check: can `word` be traced without reusing a cell?"""
    w = normalize(word)
    nbrs = neighbors(size)

    def go(i, cell, used):
        if i == len(w):
            return True
        return any(grid[n] == w[i] and n not in used and go(i + 1, n, used | {n})
                   for n in nbrs[cell])
    return any(grid[s] == w[0] and go(1, s, {s}) for s in range(size * size))


class TestBasics(unittest.TestCase):
    def test_finals_and_niqqud(self):
        self.assertEqual(normalize("שָׁלוֹם"), "שלומ")
        self.assertEqual(normalize(" ארץ "), "ארצ")

    def test_neighbors(self):
        for size in (3, 4, 5, 7):
            n = neighbors(size)
            self.assertEqual(len(n), size * size)
            self.assertEqual(len(n[0]), 3)                        # corner
            self.assertEqual(len(n[1]), 5)                        # edge
            self.assertEqual(len(n[size + 1]), 8)                 # inner cell

    def test_presets_and_overrides(self):
        self.assertEqual(preset(4).max_same_letter, 2)
        s = preset(4, min_main=40)
        self.assertEqual((s.size, s.min_main, s.max_main), (4, 40, PRESETS[4].max_main))
        self.assertEqual(preset(9).size, 9)                       # derived, no preset
        with self.assertRaises(ValueError):
            preset(4, min_distinct=20)                            # only 16 cells
        with self.assertRaises(ValueError):
            preset(5, min_main=50, max_main=40)


class TestSolver(unittest.TestCase):
    def test_matches_brute_force(self):
        rng = random.Random(7)
        for size in (3, 4, 5):
            for _ in range(2):
                grid = rng.choices(LEX.letters, LEX.letter_weights, k=size * size)
                fast = set(solve(grid, LEX))
                present = {w for w in WORDS
                           if len(normalize(w)) >= 4 and brute_force_in_grid(grid, w, size)}
                # words that fold to the same letters appear once, under one spelling
                self.assertEqual({normalize(w) for w in fast}, {normalize(w) for w in present},
                                 f"{size}x{size}")

    def test_no_cell_reuse(self):
        grid = list("אבגדהוזחטיכלמנסעפצקרשתאבג")
        for word, (_, path) in solve(grid, LEX, with_paths=True).items():
            self.assertEqual(len(set(path)), len(path))


class TestGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        start = date(2026, 9, 20)
        cls.boards = {size: [daily_board(start + timedelta(days=i), LEX, preset(size))
                             for i in range(25)] for size in SIZES}

    def test_deterministic(self):
        for size in SIZES:
            again = daily_board(date(2026, 9, 20), LEX, preset(size))
            self.assertEqual(again.grid, self.boards[size][0].grid)

    def test_sizes_differ(self):
        self.assertNotEqual(len(self.boards[4][0].grid), len(self.boards[5][0].grid))

    def test_days_differ(self):
        for size in SIZES:
            self.assertEqual(len({tuple(b.grid) for b in self.boards[size]}), 25)

    def test_requirements(self):
        for size in SIZES:
            s = preset(size)
            for b in self.boards[size]:
                with self.subTest(size=size, day=b.date):
                    self.assertEqual(b.size, size)
                    self.assertTrue(s.min_main <= len(b.main) <= s.max_main)
                    lens = [len(normalize(w)) for w in b.main]
                    self.assertTrue(s.min_longest <= max(lens) <= s.max_longest)
                    self.assertTrue(s.min_long_words <= sum(k >= s.long_len for k in lens)
                                    <= s.max_long_words + 1)
                    self.assertEqual(main_cells(b.grid, LEX), (1 << len(b.grid)) - 1)   # no dead letters
                    c = Counter(b.grid)
                    self.assertLessEqual(max(c.values()), s.max_same_letter)
                    self.assertGreaterEqual(len(c), s.min_distinct)
                    self.assertLessEqual(len(b.bonus), s.max_bonus_ratio * len(b.main))
                    found = solve(b.grid, LEX)
                    self.assertFalse([w for w, (cat, _) in found.items() if cat == BLOCKED])

    def test_long_words_vary(self):
        # the longest word and the number of long words change from day to day
        for size in SIZES:
            s = preset(size)
            longest = {max(len(normalize(w)) for w in b.main) for b in self.boards[size]}
            longs = {sum(len(normalize(w)) >= s.long_len for w in b.main) for b in self.boards[size]}
            with self.subTest(size=size):
                self.assertGreater(len(longest), 1)
                self.assertGreater(len(longs), 3)

    def test_long_targets(self):
        rng = random.Random(1)
        floor = preset(4, max_longest=0, max_long_words=0)
        self.assertEqual(_long_targets(floor, rng), (6, 99, 2, 10 ** 6, 6))
        for _ in range(50):
            lg_lo, lg_hi, lw_lo, lw_hi, long_len = _long_targets(preset(4), rng)
            self.assertTrue(6 <= lg_lo == lg_hi <= 8)
            self.assertTrue(2 <= lw_lo <= lw_hi <= 10)
            self.assertEqual(long_len, 6)
        # a day whose longest word is below long_len counts its own length instead
        short = preset(4, min_longest=5, max_longest=5)
        self.assertEqual(_long_targets(short, rng)[4], 5)
        # no word is under 4 letters, so a lower floor is raised to 4 rather than
        # letting a ceiling be drawn below anything the board could reach
        self.assertEqual(_long_targets(preset(4, min_longest=0), rng)[:2], (4, 99))
        for _ in range(20):
            lg_lo, lg_hi = _long_targets(preset(4, min_longest=0, max_longest=8), rng)[:2]
            self.assertTrue(4 <= lg_lo == lg_hi <= 8)

    def test_floor_only_override_drops_the_ceiling(self):
        # "at least 6" is a floor, not the range 6..<whatever the preset carried>
        s = preset(4, min_longest=6, min_long_words=3)
        self.assertEqual((s.max_longest, s.max_long_words), (0, 0))
        self.assertEqual(_long_targets(s, random.Random(1))[:4], (6, 99, 3, 10 ** 6))
        # setting both still asks for a range, and the preset itself is untouched
        self.assertEqual(preset(4, min_longest=6, max_longest=7).max_longest, 7)
        self.assertEqual((preset(4).max_longest, preset(4).max_long_words), (8, 9))
        # the same holds for any other shape, via settings_for
        star = settings_for(Shape.parse("X.X/XXX/X.X", "plus"), LEX, samples=8,
                            min_long_words=2)
        self.assertEqual(star.max_long_words, 0)

    def test_relax_drops_the_ceilings(self):
        # a lower "no main word longer than X" is a stricter rule, so a relaxed
        # round clears the ceilings instead of shrinking them
        step, looser = _relax(preset(4))
        self.assertEqual((looser.max_longest, looser.max_long_words), (0, 0))
        self.assertLess(looser.min_longest, preset(4).min_longest)
        self.assertIn("max_longest 8->0 (no ceiling)", step)
        self.assertEqual(_long_targets(looser, random.Random(1))[1], 99)
        # a ceiling the caller turned off (max below min) stays off as the floor
        # drops, and isn't reported as loosened
        off = preset(4, min_longest=6, max_longest=1, min_long_words=3, max_long_words=2)
        step, looser = _relax(off)
        self.assertEqual((looser.max_longest, looser.max_long_words), (0, 0))
        self.assertFalse([r for r in step
                          if r.startswith(("max_longest", "max_long_words"))])
        lg_lo, lg_hi, lw_lo, lw_hi, _ = _long_targets(looser, random.Random(1))
        self.assertEqual((lg_hi, lw_hi), (99, 10 ** 6))
        # and the failure message names the knobs that now cause it
        with self.assertRaises(RuntimeError) as e:
            daily_board(date(2026, 9, 20), LEX,
                        preset(4, min_main=400, max_main=500, max_steps=200,
                               max_attempts=1, relax=0))
        self.assertIn("max_longest", str(e.exception))

    def test_paths_spell_words(self):
        for size in SIZES:
            for b in self.boards[size][:5]:
                for words, cat in ((b.main, MAIN), (b.bonus, BONUS)):
                    for w, path in words.items():
                        self.assertTrue(is_valid_path(list(path), size), (b.date, w, path))
                        self.assertEqual("".join(b.grid[c] for c in path), normalize(w))
                        self.assertEqual(WORDS[w], cat)

    def test_json_roundtrip(self):
        for size in SIZES:
            b = self.boards[size][0]
            b2 = Board.from_json(b.to_json())
            self.assertEqual((b2.grid, b2.main, b2.bonus, b2.size), (b.grid, b.main, b.bonus, size))

    def test_every_preset_generates(self):
        for size in PRESETS:
            with self.subTest(size=size):
                b = daily_board(date(2026, 9, 20), LEX, preset(size))
                self.assertEqual(b.size, size)

    def test_impossible_settings_fail_clearly(self):
        s = Settings(size=3, min_main=200, max_main=210, min_distinct=5,
                     max_steps=50, max_attempts=1, relax=0)
        with self.assertRaises(RuntimeError):
            daily_board(date(2026, 9, 20), LEX, s)


class TestGame(unittest.TestCase):
    def setUp(self):
        self.board = daily_board(date(2026, 9, 20), LEX, preset(4))
        self.game = Game(self.board)

    def test_path_submission(self):
        word, path = next(iter(self.board.main.items()))
        r = self.game.submit_path(list(path))
        self.assertEqual((r.status, r.word), (MAIN, word))
        self.assertGreater(r.points, 0)
        self.assertEqual(self.game.submit_path(list(path)).status, "already_found")

    def test_typed_word_with_final_letter(self):
        words = [w for w in {**self.board.main, **self.board.bonus} if w[-1] in "ךםןףץ"]
        if not words:
            self.skipTest("no word ending in a final letter on this board")
        r = self.game.submit_word(words[0])
        self.assertIn(r.status, (MAIN, BONUS))
        # same letters typed without the final form still match
        self.assertEqual(self.game.submit_word(normalize(words[0])).status, "already_found")

    def test_bonus_scores_double(self):
        word, path = max(self.board.bonus.items(), key=lambda kv: len(kv[0]))
        r = self.game.submit_path(list(path))
        self.assertEqual(r.status, BONUS)
        self.assertEqual(r.points, word_points(word, MAIN) * 2)

    def test_rejections(self):
        self.assertEqual(self.game.submit_path([0, 0, 1, 2]).status, "bad_path")   # reuse
        self.assertEqual(self.game.submit_path([0, 2, 3, 1]).status, "bad_path")   # jump
        self.assertEqual(self.game.submit_path([0, 1, 2, 3, 16]).status, "bad_path")  # off board
        self.assertEqual(self.game.submit_path([0, 1, 2]).status, "too_short")
        self.assertEqual(self.game.submit_word("אבגד").status, "not_a_word")

    def test_completion(self):
        for path in self.board.main.values():
            self.game.submit_path(list(path))
        self.assertTrue(self.game.progress["complete"])


RING = Shape.parse("XXX/X.X/XXX", "ring3")
HEART = Shape.parse(".X.X./XXXXX/XXXXX/.XXX./..X..", "heart")


def brute_force_on(grid, word, shape):
    w = normalize(word)
    nbrs = shape.neighbors

    def go(i, cell, used):
        if i == len(w):
            return True
        return any(grid[n] == w[i] and n not in used and go(i + 1, n, used | {n})
                   for n in nbrs[cell])
    return any(grid[s] == w[0] and go(1, s, {s}) for s in range(len(grid)))


class TestShapes(unittest.TestCase):
    def test_hole_blocks_paths(self):
        # ring3: cells 0 1 2 / 3 . 4 / 5 6 7 — the middle is empty
        self.assertEqual(RING.n_cells, 8)
        self.assertEqual(sorted(RING.neighbors[1]), [0, 2, 3, 4])      # top middle
        self.assertNotIn(4, RING.neighbors[3])                           # left/right across the hole
        self.assertTrue(is_valid_path([3, 0, 1, 2], RING))
        self.assertFalse(is_valid_path([3, 4], RING))

    def test_solver_on_shapes_matches_brute_force(self):
        rng = random.Random(3)
        for shape in (RING, HEART, Shape.parse("XX..../XXX.../.XXX../..XXX./...XXX/....XX")):
            grid = rng.choices(LEX.letters, LEX.letter_weights, k=shape.n_cells)
            fast = {normalize(w) for w in solve(grid, LEX, shape=shape)}
            slow = {normalize(w) for w in WORDS
                    if len(normalize(w)) >= 4 and brute_force_on(grid, w, shape)}
            self.assertEqual(fast, slow, shape.name)

    def test_generate_any_shape(self):
        s = settings_for(HEART, LEX)
        b = daily_board(date(2026, 9, 20), LEX, s)
        self.assertEqual(b.shape, HEART)
        self.assertTrue(s.min_main * 0.5 <= len(b.main))
        self.assertEqual(main_cells(b.grid, LEX, HEART), (1 << HEART.n_cells) - 1)
        for w, path in list(b.main.items())[:20]:
            self.assertTrue(is_valid_path(list(path), HEART))
            self.assertEqual("".join(b.grid[c] for c in path), normalize(w))
        b2 = Board.from_json(b.to_json())
        self.assertEqual((b2.shape, b2.grid, b2.main), (b.shape, b.grid, b.main))
        g = Game(b2)
        w, path = next(iter(b2.main.items()))
        self.assertEqual(g.submit_path(list(path)).status, MAIN)

    def test_square_via_settings_for_matches_preset(self):
        a = daily_board(date(2026, 9, 20), LEX, preset(4))
        b = daily_board(date(2026, 9, 20), LEX, settings_for(Shape.square(4), LEX))
        self.assertEqual(a.grid, b.grid)


class TestThemes(unittest.TestCase):
    def test_required_and_theme_words(self):
        theme = Theme("test", "בדיקה", required=("עצמאות",), words=("מדינה", "חגיגה", "דגלים"),
                      min_words=1)
        for shape in (Shape.square(4), HEART):
            s = replace(settings_for(shape, LEX), theme=theme)
            b = daily_board(date(2026, 9, 21), LEX, s)
            self.assertIn("עצמאות", b.main)                 # always placed
            self.assertIn("עצמאות", b.theme["words"])
            self.assertTrue(set(b.theme["words"]) <= set(b.main))
            self.assertEqual(b.theme["title"], "בדיקה")

    def test_many_required_words_share_cells(self):
        import random
        from wordgame import _place_words
        words = ("כיפור", "סליחה", "סליחות", "תשובה", "תפילה", "תענית", "נעילה", "כפרה",
                 "מחילה", "שופר", "וידוי", "מחזור", "יזכור", "חתימה", "נדרים")
        shape = Shape.square(6)
        fixed, _ = _place_words(words, shape, random.Random(1))
        grid = [fixed.get(c, "א") for c in range(shape.n_cells)]
        found = solve(grid, LEX.with_main(words), shape=shape)
        for w in words:
            self.assertIn(w, found)

    def test_common_only(self):
        lex = LEX.common_only(4.5)
        self.assertEqual(lex.lookup("להיות")[0], "main")
        self.assertEqual(lex.lookup("ויולה")[0], "bonus")

    def test_blocked_theme_word_is_refused(self):
        with self.assertRaises(ValueError):
            LEX.with_main(["שרמוטה"])


class TestSchedule(unittest.TestCase):
    def test_precedence(self):
        import generate_days as gd
        sched = {"default": {"shape": "4x4"},
                 "weekdays": {"saturday": {"shape": ["heart", "diamond"]}},
                 "dates": {"2026-09-26": {"theme": "sukkot"}, "2026-09-22": {"shape": "ring"}}}
        self.assertEqual(gd.plan_for(date(2026, 9, 21), sched)["shape"], "4x4")        # Monday
        self.assertIn(gd.plan_for(date(2026, 9, 19), sched)["shape"], ("heart", "diamond"))
        self.assertEqual(gd.plan_for(date(2026, 9, 22), sched)["shape"], "ring")        # date wins
        p = gd.plan_for(date(2026, 9, 26), sched)                                       # themed Saturday
        self.assertEqual(p["theme"], "sukkot")
        self.assertIn(p["shape"], ("heart", "diamond"))

    def test_command_line_flags_act_as_date_entry(self):
        import generate_days as gd
        sched = {"default": {"shape": "5x5"}}
        p = gd.plan_for(date(2026, 9, 21), sched, {"theme": "yomkippur"})
        self.assertEqual((p["shape"], p["main_zipf"]), ("4x4", 4.0))   # the theme's shape and settings
        p = gd.plan_for(date(2026, 9, 21), sched, {"theme": "yomkippur", "main_zipf": 4.5})
        self.assertEqual(p["main_zipf"], 4.5)                           # a flag beats the theme


if __name__ == "__main__":
    unittest.main()
