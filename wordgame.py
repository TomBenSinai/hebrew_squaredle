"""
Core of a daily Hebrew word-grid game (standard library only).

A board is any shape you can draw on a grid: a square, a diamond, a heart, a
ring with a hole... A word is traced through touching cells (horizontal,
vertical or diagonal, any change of direction), using each cell at most once;
a hole in the shape blocks the path. Every day has one board with a target
number of MAIN words (common words); BONUS words (rarer forms and slang) are
extra. A board can also carry a THEME: a title, words that must be on it, and
theme words that count as main words and are highlighted.

Hebrew final letters (ך ם ן ף ץ) are shown and matched as their regular
forms (כ מ נ פ צ): a cell can't know whether it ends a word.

Typical use
    lex = Lexicon.load("data")
    board = daily_board(date(2026, 9, 20), lex, preset(4))          # 4x4
    heart = Shape.parse(".X.X./XXXXX/XXXXX/.XXX./..X..", "heart")
    board = daily_board(date(2026, 9, 20), lex, settings_for(heart, lex))
    game = Game(board)
    game.submit_path([5, 6, 2, 3])       # cells the player dragged over
    board.to_json()                      # everything a front end needs

Cells are numbered in reading order (row by row, left to right in the mask),
skipping holes: cell 0 is the first X of the first row.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import date
from functools import lru_cache
from pathlib import Path

FINAL_TO_REGULAR = str.maketrans("ךםןףץ", "כמנפצ")
MAIN, BONUS, BLOCKED = "main", "bonus", "blocked"


def normalize(word: str) -> str:
    """Strip spaces/niqqud and fold final letters: 'שָׁלוֹם ' -> 'שלומ'."""
    word = "".join(ch for ch in word.strip() if "א" <= ch <= "ת")
    return word.translate(FINAL_TO_REGULAR)


# ============================================================== shapes

CELL = "X"


@dataclass(frozen=True)
class Shape:
    """
    A board layout drawn on a grid. `mask` is a tuple of equal-length rows;
    'X' is a cell, any other character ('.', ' ') is empty. Two cells touch if
    they are next to each other horizontally, vertically or diagonally.
    """
    mask: tuple[str, ...]
    name: str = ""

    def __post_init__(self):
        if not self.mask or not any(CELL in row for row in self.mask):
            raise ValueError("a shape needs at least one cell (X)")
        width = max(len(r) for r in self.mask)
        object.__setattr__(self, "mask", tuple(r.ljust(width, ".") for r in self.mask))

    @classmethod
    def square(cls, n: int) -> "Shape":
        return cls(tuple(CELL * n for _ in range(n)), f"{n}x{n}")

    @classmethod
    def rect(cls, rows: int, cols: int) -> "Shape":
        return cls(tuple(CELL * cols for _ in range(rows)), f"{rows}x{cols}")

    @classmethod
    def parse(cls, text: str, name: str = "") -> "Shape":
        """Rows separated by '/' or newlines: ".X.X./XXXXX/XXXXX/.XXX./..X.."."""
        rows = [r.strip() for r in text.replace("/", "\n").splitlines() if r.strip()]
        rows = ["".join(CELL if ch in "Xx#*1" else "." for ch in r) for r in rows]
        return cls(tuple(rows), name)

    @property
    def rows(self) -> int:
        return len(self.mask)

    @property
    def cols(self) -> int:
        return len(self.mask[0])

    @property
    def cells(self) -> tuple[tuple[int, int], ...]:
        return _cells(self.mask)

    @property
    def n_cells(self) -> int:
        return len(self.cells)

    @property
    def neighbors(self) -> tuple[tuple[int, ...], ...]:
        return _neighbors(self.mask)

    @property
    def is_full_square(self) -> bool:
        return self.rows == self.cols and all(set(r) == {CELL} for r in self.mask)

    @property
    def key(self) -> str:
        return "/".join(self.mask)

    def render(self, letters: list[str], hole: str = "·") -> list[str]:
        """Rows of letters (with `hole` where there is no cell), for printing."""
        index = {rc: i for i, rc in enumerate(self.cells)}
        return ["".join(letters[index[(r, c)]] if (r, c) in index else hole
                        for c in range(self.cols)) for r in range(self.rows)]

    def to_json(self) -> dict:
        return {"name": self.name, "mask": list(self.mask)}

    @classmethod
    def from_json(cls, d: dict) -> "Shape":
        return cls(tuple(d["mask"]), d.get("name", ""))


@lru_cache(maxsize=None)
def _cells(mask: tuple[str, ...]) -> tuple[tuple[int, int], ...]:
    return tuple((r, c) for r, row in enumerate(mask) for c, ch in enumerate(row) if ch == CELL)


@lru_cache(maxsize=None)
def _neighbors(mask: tuple[str, ...]) -> tuple[tuple[int, ...], ...]:
    cells = _cells(mask)
    index = {rc: i for i, rc in enumerate(cells)}
    return tuple(
        tuple(index[(r + dr, c + dc)] for dr in (-1, 0, 1) for dc in (-1, 0, 1)
              if (dr or dc) and (r + dr, c + dc) in index)
        for r, c in cells)


def neighbors(shape: "Shape | int") -> tuple[tuple[int, ...], ...]:
    """For each cell, the cells touching it. Accepts a Shape or a square size."""
    if isinstance(shape, int):
        shape = Shape.square(shape)
    return shape.neighbors


def shape_of(grid, shape: "Shape | None" = None) -> Shape:
    """The given shape, or the full square that a grid of that many letters fills."""
    if shape is not None:
        if shape.n_cells != len(grid):
            raise ValueError(f"grid has {len(grid)} letters but the shape has {shape.n_cells} cells")
        return shape
    n = math.isqrt(len(grid))
    if n * n != len(grid):
        raise ValueError(f"grid of {len(grid)} letters is not square; pass its shape")
    return Shape.square(n)


def grid_size(grid) -> int:
    """Side of a full square grid (kept for older callers)."""
    return shape_of(grid).rows


_END = ""  # trie key for "a word ends here"; value = (category, original spelling)


# ============================================================== word lists

@dataclass
class Lexicon:
    """The MAIN / BONUS / BLOCKED word lists, as a trie over normalized letters."""
    trie: dict
    letters: tuple[str, ...]           # alphabet (regular forms)
    letter_weights: tuple[float, ...]  # how often each letter appears in MAIN words
    min_len: int = 4
    sizes: dict = field(default_factory=dict)
    freq: dict = field(default_factory=dict)   # MAIN word -> Zipf frequency

    @classmethod
    def load(cls, data_dir: str | Path = "data", min_len: int = 4) -> "Lexicon":
        data_dir = Path(data_dir)
        trie: dict = {}
        letter_counts: Counter = Counter()
        sizes = {}
        rank = {BLOCKED: 3, MAIN: 2, BONUS: 1}
        freq: dict[str, float] = {}

        def add(word: str, category: str) -> bool:
            key = normalize(word)
            if len(key) < min_len:
                return False
            node = trie
            for ch in key:
                node = node.setdefault(ch, {})
            prev = node.get(_END)
            # blocked beats everything, main beats bonus (e.g. two spellings
            # that fold to the same letters)
            if prev is None or rank[category] > rank[prev[0]]:
                node[_END] = (category, word)
            if category == MAIN:
                letter_counts.update(key)
            return True

        for name, category in (("blocklist.txt", BLOCKED), ("blocked_forms.txt", BLOCKED),
                               ("main.txt", MAIN), ("bonus.txt", BONUS)):
            count = 0
            if not (data_dir / name).exists():
                continue
            for line in (data_dir / name).read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("\t")
                    count += add(parts[0], category)
                    if category == MAIN and len(parts) > 1:
                        freq[parts[0]] = float(parts[1])
            sizes[category] = count

        letters, weights = zip(*sorted(letter_counts.items()))
        return cls(trie, letters, weights, min_len, sizes, freq)

    def lookup(self, word: str) -> tuple[str, str] | None:
        """(category, original spelling) for a word, or None."""
        node = self.trie
        for ch in normalize(word):
            node = node.get(ch)
            if node is None:
                return None
        return node.get(_END)

    def common_only(self, zipf: float) -> "Lexicon":
        """A copy in which MAIN words rarer than `zipf` count as BONUS: for
        crowded boards (big shapes, many theme words) that would otherwise
        hold hundreds of main words."""
        root = dict(self.trie)
        for w, z in self.freq.items():
            if z >= zipf:
                continue
            node = root
            for ch in normalize(w):
                child = node.get(ch)
                if child is None:
                    break
                node[ch] = child = dict(child)
                node = child
            else:
                if node.get(_END, (None,))[0] == MAIN:
                    node[_END] = (BONUS, node[_END][1])
        return replace(self, trie=root)

    def with_main(self, words) -> "Lexicon":
        """A copy in which `words` count as MAIN words (for a theme). The big
        trie is shared; only the nodes along the new words are copied."""
        root = dict(self.trie)
        for w in words:
            key = normalize(w)
            if len(key) < self.min_len:
                continue
            hit = self.lookup(w)
            if hit and hit[0] == BLOCKED:
                raise ValueError(f"theme word {w!r} is on the blocklist")
            node = root
            for ch in key:
                child = node.get(ch)
                child = dict(child) if child is not None else {}
                node[ch] = child
                node = child
            node[_END] = (MAIN, w)
        return replace(self, trie=root)


# ============================================================== solving

def solve(grid: list[str], lex: Lexicon, with_paths: bool = False,
          shape: Shape | None = None) -> dict[str, tuple]:
    """
    Every listed word hidden in the grid.
    Returns {original_word: (category, path)}; path is a tuple of cell indexes
    when with_paths=True, else None. `shape` defaults to the full square.
    """
    return _solve(grid, lex, with_paths, shape_of(grid, shape))[0]


def main_cells(grid: list[str], lex: Lexicon, shape: Shape | None = None) -> int:
    """Bitmask of the cells that at least one MAIN word can pass through."""
    return _solve(grid, lex, False, shape_of(grid, shape))[1]


def _solve(grid, lex, with_paths, shape: Shape):
    found: dict[str, tuple] = {}
    cells = 0                      # union of every path that spells a MAIN word
    nbrs = shape.neighbors

    def dfs(cell: int, node: dict, used: int, path: tuple) -> None:
        nonlocal cells
        end = node.get(_END)
        if end is not None:
            if end[0] == MAIN:
                cells |= used
            if end[1] not in found:
                found[end[1]] = (end[0], path if with_paths else None)
        for nxt in nbrs[cell]:
            if not used >> nxt & 1:
                child = node.get(grid[nxt])
                if child is not None:
                    dfs(nxt, child, used | 1 << nxt, path + (nxt,) if with_paths else path)

    for start in range(len(grid)):
        child = lex.trie.get(grid[start])
        if child is not None:
            dfs(start, child, 1 << start, (start,) if with_paths else ())
    return found, cells


# ============================================================== themes

@dataclass(frozen=True)
class Theme:
    """
    A themed day. `required` words are placed on the board for sure; the
    other `words` count as MAIN words when they turn up (and at least
    `min_words` of all theme words must). Both are highlighted in the game.
    """
    name: str
    title: str = ""
    required: tuple[str, ...] = ()
    words: tuple[str, ...] = ()
    min_words: int = 0
    shape: str = ""                # optional default shape for this theme

    @property
    def all_words(self) -> tuple[str, ...]:
        seen, out = set(), []
        for w in self.required + self.words:
            k = normalize(w)
            if len(k) >= 4 and k not in seen:
                seen.add(k)
                out.append(w.strip())
        return tuple(out)

    @classmethod
    def load(cls, path: str | Path) -> "Theme":
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(name=d.get("name", Path(path).stem), title=d.get("title", ""),
                   required=tuple(d.get("required", ())), words=tuple(d.get("words", ())),
                   min_words=int(d.get("min_words", 0)), shape=d.get("shape", ""))


# ============================================================== settings & presets

@dataclass(frozen=True)
class Settings:
    size: int = 5               # a full size x size square, unless `mask` is set
    mask: str = ""              # any other shape: rows separated by '/', X = cell
    shape_name: str = ""
    min_main: int = 30          # every board has between min_main ...
    max_main: int = 90          # ... and max_main MAIN words
    spread: int = 10            # each day picks a target in the range; the board
                                # lands within +-spread of it (so days vary)
    min_longest: int = 6        # at least one MAIN word this long (a "big find")
    max_longest: int = 0        # >0: each day picks a length in min_longest..max_longest
                                # and the longest MAIN word is exactly that long.
                                # Overriding min_longest alone clears it (_override)
    long_len: int = 6           # what counts as a "long" word ...
    min_long_words: int = 1     # ... and at least this many long MAIN words per board
    max_long_words: int = 0     # >0: each day picks a count in min_long_words..max_long_words
                                # and the board has that many long words, +-1.
                                # Overriding min_long_words alone clears it (_override)
    all_cells_used: int = 1     # 1: every cell is part of some MAIN word (no dead letters)
    max_same_letter: int = 3    # no letter on more than this many cells
    min_distinct: int = 14      # at least this many different letters
    max_steps: int = 6000       # annealing steps per attempt before restarting
    max_attempts: int = 20
    relax: int = 1              # 1: if nothing meets the rules, loosen them step by
                                # step (fewer long words, wider range) and say so
    main_zipf: float = 0.0      # >0: only words at least this common are MAIN, the
                                # rest BONUS (for crowded boards; 4.5 ~ everyday words)
    max_bonus_ratio: float = 1.0  # >0: at most this many BONUS words per MAIN word
                                  # (ignored with main_zipf, which makes BONUS words on purpose)
    theme: Theme | None = None

    @property
    def shape(self) -> Shape:
        return Shape.parse(self.mask, self.shape_name) if self.mask else Shape.square(self.size)

    def __post_init__(self):
        cells = self.shape.n_cells
        if cells < 2:
            raise ValueError("a board needs at least 2 cells")
        if self.min_long_words < 0 or self.long_len < 2:
            raise ValueError("need min_long_words >= 0 and long_len >= 2")
        if not 0 <= self.min_main <= self.max_main:
            raise ValueError("need 0 <= min_main <= max_main")
        if self.max_same_letter * min(22, cells) < cells:
            raise ValueError("max_same_letter is too low to fill the board")
        if self.min_distinct > min(22, cells):
            raise ValueError(f"min_distinct can't exceed {min(22, cells)} "
                             f"(22 Hebrew letters, {cells} cells)")


# Measured on the current word lists: each preset's range sits inside what a board
# of that size reaches naturally with varied letters, so generation is fast and
# the boards don't have to be crammed with the same few letters.
#   natural MAIN count on varied random boards (p10 / median / p90):
#   3x3: 12/30/57   4x4: 53/99/154   5x5: 115/202/301   6x6: 227/338/461
PRESETS: dict[int, Settings] = {
    3: Settings(size=3, min_main=15, max_main=45, spread=6, min_longest=5, max_longest=6,
                long_len=5, min_long_words=1, max_long_words=4, max_same_letter=2, min_distinct=8),
    4: Settings(size=4, min_main=40, max_main=90, spread=10, min_longest=6, max_longest=8,
                long_len=6, min_long_words=2, max_long_words=9, max_same_letter=2, min_distinct=11),
    5: Settings(size=5, min_main=100, max_main=200, spread=20, min_longest=6, max_longest=8,
                long_len=6, min_long_words=5, max_long_words=16, max_same_letter=3, min_distinct=14),
    6: Settings(size=6, min_main=200, max_main=350, spread=30, min_longest=7, max_longest=9,
                long_len=6, min_long_words=12, max_long_words=30, max_same_letter=4, min_distinct=17),
    7: Settings(size=7, min_main=320, max_main=560, spread=40, min_longest=8, max_longest=10,
                long_len=6, min_long_words=18, max_long_words=40, max_same_letter=5, min_distinct=19),
}


# A floor and the ceiling that bounds it. Overriding only the floor drops the
# ceiling: a caller asking for "at least N" means a floor, not the range
# N..<whatever the preset happened to carry>.
_CEILING_OF = {"min_longest": "max_longest", "min_long_words": "max_long_words"}


def _override(base: Settings, overrides: dict) -> Settings:
    """`replace(base, **overrides)`, except that setting a floor without its
    ceiling also clears the inherited ceiling (see _CEILING_OF)."""
    o = dict(overrides)
    for lo, hi in _CEILING_OF.items():
        if lo in o and hi not in o:
            o[hi] = 0
    return replace(base, **o)


def preset(size: int = 5, **overrides) -> Settings:
    """
    Settings for a full square, with any field overridden:
        preset(4)                       # the 4x4 preset
        preset(4, min_main=35)          # 4x4, but at least 35 main words
        preset(8)                       # no preset: scaled from the nearest one
    For any other shape use settings_for(shape, lex).
    """
    if size in PRESETS:
        base = PRESETS[size]
    else:
        near = min(PRESETS, key=lambda s: abs(s - size))
        p, k = PRESETS[near], (size * size) / (near * near)
        cells = size * size
        base = Settings(
            size=size,
            min_main=max(1, round(p.min_main * k)),
            max_main=max(2, round(p.max_main * k)),
            spread=max(1, round(p.spread * k)),
            min_longest=max(4, min(size * size, p.min_longest + (size - near))),
            max_longest=max(4, min(size * size, p.max_longest + (size - near))),
            long_len=p.long_len,
            min_long_words=max(0, round(p.min_long_words * k)),
            max_long_words=max(1, round(p.max_long_words * k)),
            max_same_letter=max(math.ceil(cells / 22), round(p.max_same_letter * k)),
            min_distinct=min(22, cells, round(p.min_distinct * math.sqrt(k))),
        )
    return _override(base, overrides)


def _random_varied(rng, lex, n, max_same, min_distinct):
    for _ in range(200):
        g = rng.choices(lex.letters, lex.letter_weights, k=n)
        c = Counter(g)
        if max(c.values()) <= max_same and len(c) >= min_distinct:
            return g
    return g


_CALIBRATION: dict = {}


def _calibrate(shape: Shape, lex: Lexicon, samples: int) -> tuple:
    """(p10 main count, median main count, p90 long-word count, max_same, min_distinct)
    for random varied boards of this shape. Cached per shape and word list."""
    key = (shape.key, id(lex), samples)
    if key in _CALIBRATION:
        return _CALIBRATION[key]
    n = shape.n_cells
    max_same = max(2, math.ceil(n / 8))
    min_distinct = min(22, n, round(0.5 * n + 3))
    rng = random.Random(12345)
    counts, longs = [], []
    for _ in range(samples):
        g = _random_varied(rng, lex, n, max_same, min_distinct)
        found = _solve(g, lex, False, shape)[0]
        main = [w for w, (cat, _) in found.items() if cat == MAIN]
        counts.append(len(main))
        longs.append(sum(1 for w in main if len(normalize(w)) >= 6))
    counts.sort()
    longs.sort()
    q = lambda xs, p: xs[min(len(xs) - 1, int(p * len(xs)))]
    _CALIBRATION[key] = (q(counts, .1), q(counts, .5), q(longs, .9), max_same, min_distinct)
    return _CALIBRATION[key]


def settings_for(shape: Shape, lex: Lexicon, samples: int = 120, **overrides) -> Settings:
    """
    Settings for any shape. Full squares use their preset; any other shape is
    measured first: random boards of that shape are solved to see how many
    words it holds naturally, and the ranges are set from that (the same way
    the square presets were chosen). Any field can still be overridden.
    """
    if shape.is_full_square and shape.rows in PRESETS:
        return _override(preset(shape.rows), {
            "shape_name": shape.name or f"{shape.rows}x{shape.rows}", **overrides})
    p10, med, long90, max_same, min_distinct = _calibrate(shape, lex, samples)
    n = shape.n_cells
    min_main = max(8, round(p10 * 0.75))
    max_main = max(min_main + 6, round(med * 0.9))
    longest = 7 if n >= 14 else (6 if n >= 9 else 5)
    max_long = max(2, min(round(n * 0.5), long90 + 3))
    base = Settings(
        mask=shape.key, shape_name=shape.name,
        min_main=min_main, max_main=max_main,
        spread=max(3, round((max_main - min_main) / 5)),
        min_longest=longest - 1, max_longest=longest + (n >= 20),
        long_len=6,
        min_long_words=max(1, round(max_long * 0.25)), max_long_words=max_long,
        max_same_letter=max_same, min_distinct=min_distinct,
    )
    return _override(base, overrides)


# ============================================================== boards

@dataclass
class Board:
    date: str
    grid: list[str]                       # one letter per cell, in cell order
    main: dict[str, tuple[int, ...]]      # word -> one path that spells it
    bonus: dict[str, tuple[int, ...]]
    seed: int
    shape: Shape | None = None            # None: the full square
    theme: dict | None = None             # {"name", "title", "words": [...on this board]}
    relaxed: list[str] = field(default_factory=list)   # rules loosened to make it

    def __post_init__(self):
        self.shape = shape_of(self.grid, self.shape)

    @property
    def size(self) -> int:
        """Side of a full square board (rows of the bounding box otherwise)."""
        return self.shape.rows

    def rows(self) -> list[str]:
        return self.shape.render(self.grid)

    def to_json(self) -> dict:
        order = lambda d: sorted(d, key=lambda w: (-len(w), w))
        out = {
            "date": self.date,
            "seed": self.seed,
            "shape": self.shape.to_json(),
            "letters": "".join(self.grid),
            "grid": self.rows(),                 # for reading; '·' = no cell
            "main_count": len(self.main),
            "bonus_count": len(self.bonus),
            "main": {w: list(self.main[w]) for w in order(self.main)},
            "bonus": {w: list(self.bonus[w]) for w in order(self.bonus)},
        }
        if self.shape.is_full_square:
            out["size"] = self.shape.rows
        if self.theme:
            out["theme"] = self.theme
        if self.relaxed:
            out["relaxed"] = self.relaxed
        return out

    @classmethod
    def from_json(cls, d: dict) -> "Board":
        if "letters" in d:                       # current format (any shape)
            grid = list(d["letters"])
            shape = Shape.from_json(d["shape"])
        else:                                    # older square boards
            grid = [ch for row in d["grid"] for ch in row]
            shape = None
        return cls(d["date"], grid,
                   {w: tuple(p) for w, p in d["main"].items()},
                   {w: tuple(p) for w, p in d["bonus"].items()}, d["seed"],
                   shape, d.get("theme"), d.get("relaxed", []))


# ============================================================== generation

def _long_targets(s: Settings, rng) -> tuple[int, int, int, int, int]:
    """The day's (longest lo, longest hi, long-word count lo, hi, long_len). A max
    below its min (or 0) means there's no upper bound: just the floor, as before.
    On a day whose longest word is shorter than `long_len`, that length is the
    day's "long" instead, so the count is still asked of the board's big words.
    No word is under 4 letters, so a lower floor than that is no floor at all -
    it is raised, or a ceiling drawn beneath it would be unreachable."""
    lg_lo, lg_hi = max(4, s.min_longest), 99
    if s.max_longest >= lg_lo:
        lg_lo = lg_hi = rng.randint(lg_lo, s.max_longest)
    long_len = min(s.long_len, lg_hi)
    lw_lo, lw_hi = s.min_long_words, 10 ** 6
    if s.max_long_words >= s.min_long_words:
        t = rng.randint(s.min_long_words, s.max_long_words)
        lw_lo, lw_hi = max(s.min_long_words, t - 1), t + 1
    return lg_lo, lg_hi, lw_lo, lw_hi, long_len


def _relax(cur: Settings) -> tuple[list[str], Settings]:
    """Loosen the rules that are hardest on unusual shapes, for another round.
    Returns what was loosened (for board.relaxed) and the looser settings.

    The day's ceilings go first and for good: "no MAIN word longer than X" only
    gets *harder* as X falls, so a smaller ceiling is not a relaxation. Clearing
    them also means a ceiling the caller deliberately turned off (a `max_` below
    its `min_`) can't come back to life as the floor drops."""
    step = []
    if cur.min_long_words > 1:
        step.append(f"min_long_words {cur.min_long_words}->{max(1, cur.min_long_words - 2)}")
    if cur.max_long_words >= cur.min_long_words:
        step.append(f"max_long_words {cur.max_long_words}->0 (no ceiling)")
    if cur.min_longest > 5:
        step.append(f"min_longest {cur.min_longest}->{cur.min_longest - 1}")
    if cur.max_longest >= cur.min_longest:
        step.append(f"max_longest {cur.max_longest}->0 (no ceiling)")
    step.append(f"main range {cur.min_main}-{cur.max_main}->"
                f"{round(cur.min_main * .8)}-{round(cur.max_main * 1.2)}")
    if cur.max_bonus_ratio and not cur.main_zipf:
        step.append(f"max_bonus_ratio {cur.max_bonus_ratio:g}->{cur.max_bonus_ratio * 1.25:g}")
    return step, replace(cur, min_long_words=max(1, cur.min_long_words - 2),
                         max_long_words=0,
                         min_longest=max(5, cur.min_longest - 1),
                         max_longest=0,
                         min_main=round(cur.min_main * .8), max_main=round(cur.max_main * 1.2),
                         max_bonus_ratio=cur.max_bonus_ratio * 1.25,
                         max_attempts=max(6, cur.max_attempts // 2))


def _evaluate(grid, lex, s: Settings, shape: Shape, lo: int, hi: int, theme_keys,
              longs=None) -> float:
    """Lower is better; 0 means the board meets every requirement. `longs` are
    the day's long-word targets from _long_targets (default: just the floors)."""
    lg_lo, lg_hi, lw_lo, lw_hi, long_len = longs or (s.min_longest, 99, s.min_long_words,
                                                     10 ** 6, s.long_len)
    counts = Counter(grid)
    cost = 3.0 * sum(max(0, c - s.max_same_letter) for c in counts.values())
    cost += 3.0 * max(0, s.min_distinct - len(counts))

    found, cells = _solve(grid, lex, False, shape)
    main = [w for w, (cat, _) in found.items() if cat == MAIN]
    if s.all_cells_used:
        cost += 2 * (len(grid) - bin(cells).count("1"))
    n = len(main)
    if n < lo:
        cost += lo - n
    elif n > hi:
        cost += n - hi
    if s.max_bonus_ratio and not s.main_zipf:
        bonus = sum(1 for cat, _ in found.values() if cat == BONUS)
        cost += 0.5 * max(0, bonus - s.max_bonus_ratio * n)
    lens = [len(normalize(w)) for w in main]
    if not any(k >= lg_lo for k in lens):
        cost += 5
    cost += 2 * sum(1 for k in lens if k > lg_hi)
    long_words = sum(1 for k in lens if k >= long_len)
    cost += 2 * max(0, lw_lo - long_words, long_words - lw_hi)
    if theme_keys and s.theme and s.theme.min_words:
        have = sum(1 for w in main if normalize(w) in theme_keys)
        cost += 3 * max(0, s.theme.min_words - have)
    cost += 50 * sum(1 for cat, _ in found.values() if cat == BLOCKED)
    return cost


def _place_words(words, shape: Shape, rng, tries: int = 300) -> tuple[dict[int, str], set[int]] | None:
    """Lay each word along a path of touching cells. Words share cells where
    their letters agree, so many theme words fit on a small board: each word
    gets many candidate paths and the one reusing the most placed letters (and
    staying close to them) wins; the whole packing is retried and the tightest
    one kept. Returns (cell -> letter, locked cells), or None if they don't fit."""
    nbrs = shape.neighbors
    keys = [normalize(w) for w in words]
    if any(len(k) > shape.n_cells for k in keys):
        return None
    best = None
    for _round in range(tries):
        order = sorted(keys, key=lambda k: (-len(k), rng.random()))
        fixed: dict[int, str] = {}
        ok = True
        for key in order:
            cands = []
            for _ in range(40):
                path = _random_path(key, fixed, nbrs, shape.n_cells, rng)
                if path:
                    reuse = sum(1 for c in path if c in fixed)
                    near = sum(1 for c in path if c not in fixed
                               and any(n in fixed for n in nbrs[c]))
                    cands.append((reuse * 3 + near + rng.random(), path))
            if not cands:
                ok = False
                break
            path = max(cands)[1]
            for c, ch in zip(path, key):
                fixed[c] = ch
        if ok and (best is None or len(fixed) < len(best)):
            best = fixed
            if len(words) <= 2:
                break
    return (best, set(best)) if best else None


def _random_path(key, fixed, nbrs, n_cells, rng):
    """One path spelling `key`, preferring cells that already hold the right
    letter, then empty cells next to placed ones."""
    def rank(c, ch):
        if c in fixed:
            return 0 if fixed[c] == ch else None
        return 1 if any(n in fixed for n in nbrs[c]) else 2

    def pick(cells, ch):
        opts = [(r, rng.random(), c) for c in cells if (r := rank(c, ch)) is not None]
        opts.sort()
        # mostly the best-ranked cells, sometimes anything, to keep variety
        return [c for _, _, c in opts] if rng.random() < 0.8 else \
            rng.sample([c for _, _, c in opts], len(opts))

    path: list[int] = []

    def extend(i):
        if i == len(key):
            return True
        for c in pick([c for c in nbrs[path[-1]] if c not in path], key[i])[:4]:
            path.append(c)
            if extend(i + 1):
                return True
            path.pop()
        return False

    for start in pick(range(n_cells), key[0])[:6]:
        path[:] = [start]
        if extend(1):
            return list(path)
    return None


def _anneal(lex, s: Settings, shape: Shape, rng, lo, hi, theme_keys, required,
            longs=None) -> tuple[float, list]:
    n = shape.n_cells
    best = None
    placed = None
    if required:
        placed = _place_words(required, shape, rng)
        if placed is None:
            raise ValueError("the required words don't fit on this shape: "
                             + ", ".join(required))
    for _attempt in range(s.max_attempts):
        if required and _attempt and n <= 25:
            # small boards: the packing decides most of the board, so try a new
            # one each attempt (cheap here, slow on big shapes)
            placed = _place_words(required, shape, rng) or placed
        grid = rng.choices(lex.letters, lex.letter_weights, k=n)
        locked: set[int] = set()
        if placed:
            fixed, locked = placed
            for c, ch in fixed.items():
                grid[c] = ch
        free = [c for c in range(n) if c not in locked]
        cost = _evaluate(grid, lex, s, shape, lo, hi, theme_keys, longs)
        for step in range(s.max_steps):
            if cost == 0 or not free:
                break
            temp = max(0.05, 2.0 * (1 - step / s.max_steps))
            new = grid[:]
            if rng.random() < 0.7 or len(free) < 2:
                new[rng.choice(free)] = rng.choices(lex.letters, lex.letter_weights)[0]
            else:
                a, b = rng.sample(free, 2)
                new[a], new[b] = new[b], new[a]
            new_cost = _evaluate(new, lex, s, shape, lo, hi, theme_keys, longs)
            if new_cost <= cost or rng.random() < math.exp((cost - new_cost) / temp):
                grid, cost = new, new_cost
        if best is None or cost < best[0]:
            best = (cost, grid)
        if cost == 0:
            break
    return best


def generate(seed: int, lex: Lexicon, s: Settings | None = None, date_str: str = "") -> Board:
    """
    Simulated annealing towards a board whose MAIN count is near a target
    picked from [min_main, max_main], with varied letters, long words, every
    cell used and no blocked words. Theme words count as MAIN words; required
    theme words are placed first and never changed. Deterministic for a given
    seed + word lists + settings. With `relax`, rules that can't be met are
    loosened step by step (recorded in board.relaxed) instead of failing.
    """
    s = s or preset(5)
    shape = s.shape
    theme = s.theme
    theme_keys = set()
    if s.main_zipf:
        lex = lex.common_only(s.main_zipf)
    if theme:
        lex = lex.with_main(theme.all_words)
        theme_keys = {normalize(w) for w in theme.all_words}
    required = tuple(w for w in (theme.required if theme else ()) if len(normalize(w)) >= 4)

    relaxed: list[str] = []
    cur = s
    for round_ in range(4 if s.relax else 1):
        rng = random.Random(seed + round_)
        lo_t, hi_t = cur.min_main + cur.spread, cur.max_main - cur.spread
        target = rng.randint(lo_t, hi_t) if lo_t <= hi_t else (cur.min_main + cur.max_main) // 2
        lo, hi = max(cur.min_main, target - cur.spread), min(cur.max_main, target + cur.spread)
        longs = _long_targets(cur, rng)
        cost, grid = _anneal(lex, cur, shape, rng, lo, hi, theme_keys, required, longs)
        if cost == 0:
            break
        step, cur = _relax(cur)
        relaxed += step
    if cost:
        raise RuntimeError(
            f"No {shape.name or 'board'} ({shape.n_cells} cells) met the requirements "
            f"(best cost {cost:g}). Loosen the settings (max_longest/max_long_words - set "
            f"them to 0 to drop the day's exact-length rules - min_main/max_main, min_longest, "
            f"min_long_words, min_distinct, max_same_letter, max_bonus_ratio) or raise max_steps/max_attempts.")

    found = _solve(grid, lex, True, shape)[0]
    main = {w: p for w, (cat, p) in found.items() if cat == MAIN}
    bonus = {w: p for w, (cat, p) in found.items() if cat == BONUS}
    theme_info = None
    if theme:
        on_board = [w for w in main if normalize(w) in theme_keys]
        theme_info = {"name": theme.name, "title": theme.title,
                      "words": sorted(on_board, key=lambda w: (-len(w), w)),
                      "required": list(required)}
    return Board(date_str, grid, main, bonus, seed, shape, theme_info, relaxed)


def seed_for(day: date, salt: str = "hebrew-word-grid", size: "int | str" = 5) -> int:
    """Same date + salt + layout -> same seed on every machine.
    (5x5 keeps the original key so existing 5x5 boards don't change.)"""
    if size == 5:
        key = f"{salt}:{day.isoformat()}"
    elif isinstance(size, int):
        key = f"{salt}:{size}x{size}:{day.isoformat()}"
    else:
        key = f"{salt}:{size}:{day.isoformat()}"
    digest = hashlib.sha256(key.encode()).digest()
    return int.from_bytes(digest[:8], "big")


def daily_board(day: date, lex: Lexicon, s: Settings | None = None,
                salt: str = "hebrew-word-grid") -> Board:
    """
    The board for a given date and settings. Deterministic, but it depends on
    the word lists: editing them changes future boards, so pre-generate and
    store boards (see generate_days.py) if past days must stay fixed.
    """
    s = s or preset(5)
    shape = s.shape
    layout = shape.rows if shape.is_full_square and not s.theme else \
        f"{shape.key}|{s.theme.name if s.theme else ''}"
    return generate(seed_for(day, salt, layout), lex, s, day.isoformat())


# ============================================================== playing

def is_valid_path(path: list[int], shape: "Shape | int") -> bool:
    """Cells exist, no cell repeats, and each step moves to a touching cell."""
    nbrs = neighbors(shape)
    if not path or len(set(path)) != len(path):
        return False
    if any(not (0 <= c < len(nbrs)) for c in path):
        return False
    return all(b in nbrs[a] for a, b in zip(path, path[1:]))


POINTS_BY_LENGTH = {4: 1, 5: 2, 6: 3, 7: 5}   # 8+ letters: 11 (Boggle-style)
BONUS_MULTIPLIER = 2


def word_points(word: str, category: str) -> int:
    pts = POINTS_BY_LENGTH.get(len(normalize(word)), 11)
    return pts * BONUS_MULTIPLIER if category == BONUS else pts


@dataclass
class Result:
    status: str          # "main" | "bonus" | "already_found" | "not_a_word" | "bad_path" | "too_short"
    word: str = ""       # original spelling (with final letters) when known
    points: int = 0


class Game:
    """One player's progress on one board."""

    def __init__(self, board: Board, min_len: int = 4):
        self.board = board
        self.min_len = min_len
        # normalized letters -> (category, original word)
        self._index = {normalize(w): (MAIN, w) for w in board.main}
        self._index.update({normalize(w): (BONUS, w) for w in board.bonus})
        self.found: dict[str, str] = {}   # original word -> category, in order found
        self.score = 0

    def submit_path(self, path: list[int]) -> Result:
        """The player dragged over these cells (cell indexes)."""
        if not is_valid_path(path, self.board.shape):
            return Result("bad_path")
        return self._submit("".join(self.board.grid[c] for c in path))

    def submit_word(self, text: str) -> Result:
        """The player typed a word. Only words hidden in today's grid count."""
        return self._submit(normalize(text))

    def _submit(self, key: str) -> Result:
        if len(key) < self.min_len:
            return Result("too_short")
        hit = self._index.get(key)
        if hit is None:
            return Result("not_a_word")
        category, word = hit
        if word in self.found:
            return Result("already_found", word)
        self.found[word] = category
        pts = word_points(word, category)
        self.score += pts
        return Result(category, word, pts)

    @property
    def progress(self) -> dict:
        main_found = sum(1 for c in self.found.values() if c == MAIN)
        return {
            "main_found": main_found,
            "main_total": len(self.board.main),
            "bonus_found": len(self.found) - main_found,
            "score": self.score,
            "complete": main_found == len(self.board.main),
        }


def format_grid(board: Board) -> str:
    """The board's rows ('·' = no cell). Cell 0 is the first cell of the top row."""
    return "\n".join(" ".join(row) for row in board.rows())


def save_board(board: Board, path: str | Path) -> None:
    Path(path).write_text(json.dumps(board.to_json(), ensure_ascii=False, indent=1),
                          encoding="utf-8")
