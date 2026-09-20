# Hebrew daily word grid (core)

A Hebrew letter board each day, in any shape you can draw on a grid (squares,
a heart, a diamond, a ring with a hole...). Players trace words through touching
cells (horizontal, vertical, diagonal, any turns), never reusing a cell, 4+ letters;
an empty spot in the shape blocks the path. A schedule picks each day's shape, and
days can carry a **theme** (a title, words that must appear, highlighted theme words). Each board has a set range of **MAIN words** (common words)
to find; **BONUS words** (rarer words and slang) earn double points but aren't
needed to finish.

Python 3.10+, standard library only (the game side runs offline as-is).

**More docs:** [docs/GAME.md](docs/GAME.md) (rules and screen), [docs/ALGORITHM.md](docs/ALGORITHM.md)
(how boards are made), [docs/BOARDS.md](docs/BOARDS.md) (how-to for boards, shapes and themes),
and [skills/rivuon-boards/SKILL.md](skills/rivuon-boards/SKILL.md) (a Claude skill for creating boards).

## Files

| File | What it is |
|---|---|
| `wordgame.py` | The core: word lists, solver, generator, daily seed, `Game` state and scoring |
| `generate_days.py` | Pre-generate boards by the schedule to `boards/daily/YYYY-MM-DD.json`, or make one day special |
| `schedule.json` | Which shape/theme each day gets: default, per weekday, per date |
| `shapes.json` | The shape library (X = cell, . = empty) |
| `themes/*.json` | Themes: title, required words, theme words, minimum theme words, optional shape |
| `build_wordlists.py` | Rebuilds `data/main.txt` and `data/bonus.txt` (needs `pip install wordfreq`, so run it online) |
| `test_wordgame.py` | `python -m unittest test_wordgame -v` |
| `data/main.txt`, `data/bonus.txt` | Built lists: `word<TAB>frequency` (22,083 main / 60,446 bonus) |
| `data/slang.txt` | Hand-written slang, always bonus (kept only if found in real usage) |
| `data/extra_spellings.txt` | 2017 Academy spellings the dictionary lacks (חוכמה, תיאטרון, אונייה...) |
| `data/function_words.txt` | Real words the dictionary doesn't tag (עכשיו, אתמול, פתאום...) |
| `data/exclude.txt` | Proper nouns to drop (ישראל, לונדון...) |
| `data/blocklist.txt`, `data/blocked_lemmas.txt` | Slurs, vulgar and distressing words: every form is blocked and kept off every board |
| `data/morph.tsv` | Grammar of every form (headword / inflection / construct-or-suffix / infinitive / name) and its lemma, from Hspell |
| `analyze_hspell.py` | Rebuilds `data/morph.tsv` (needs Hspell 1.4 compiled with `--enable-linginfo`) |
| `sources/` | Hspell 1.4 word lists (AGPL-3.0, see `sources/COPYING`) |

## Use

```bash
python generate_days.py --start 2026-09-01 --days 212 --force   # every day, by the schedule
python generate_days.py --date 2026-09-19 --shape heart         # make one day special (recorded in schedule.json)
python generate_days.py --date 2027-05-12 --theme independence  # a themed day (uses the theme's shape)
python generate_days.py --date 2026-09-20 --shape "XXXXX/X...X/XXXXX" --no-save   # try an inline shape
python generate_days.py --shapes                                # show the shape library
python generate_days.py --show 2026-09-19                       # print a stored board
```

## Shapes

Draw any shape in `shapes.json` (or pass it inline with `/` between rows): `X` is a cell,
`.` is empty. Built in: 4x4, 5x5, diamond, heart, cross, plus, ring, donut, wide, tall,
stairs, star, hourglass.

Irregular shapes hold far fewer words than a square with the same number of cells, so
their settings are **measured automatically**: random boards of the shape are solved first
and the main-word range, long-word goal and letter rules are set from that (squares use
the presets below). If a shape still can't meet the rules, they are loosened step by step
and the board records what was loosened (`--relax 0` makes it fail instead). Any setting
can be forced with a flag: `--min-main`, `--max-main`, `--spread`, `--min-longest`,
`--long-len`, `--min-long-words`, `--all-cells-used`, `--max-same-letter`, `--min-distinct`,
`--max-steps`, `--max-attempts`, `--relax`, `--main-zipf`.

| Square | Main words | Target +- | Longest word | Long words (6+ letters) | Max of one letter | Min different letters |
|---|---|---|---|---|---|---|
| 3x3 | 15-45 | 6 | 5+ | 2 (of 5+) | 2 | 8 |
| 4x4 | 40-90 | 10 | 7+ | 6 | 2 | 11 |
| 5x5 | 100-200 | 20 | 7+ | 8 | 3 | 14 |
| 6x6 | 200-350 | 30 | 8+ | 18 | 4 | 17 |
| 7x7 | 320-560 | 40 | 8+ | 26 | 5 | 19 |

## Schedule and special days

`schedule.json` decides each day; the most specific rule wins (date > weekday > default):

```json
{
  "default":  {"shape": "4x4"},
  "weekdays": {"saturday": {"shape": ["heart", "diamond", "star", "ring"]}},
  "dates":    {"2026-09-26": {"theme": "sukkot"},
               "2026-10-01": {"shape": "heart", "min_long_words": 8}}
}
```

A list of shapes rotates week by week. Any setting can go in an entry. For a themed date
without its own shape, the theme's `shape` is used, else the weekday/default one.
`generate_days.py --date D --shape ... --theme ...` writes such an entry for you.

## Themes

```json
{
  "title": "סוכות",
  "shape": "",
  "required": ["סוכה"],
  "words": ["סוכות", "לולב", "אתרוג", "הדסים", "ערבה", "..."],
  "min_words": 4
}
```

- **required**: always on the board. They're placed along a path first and never changed
  while the rest of the board is built.
- **words**: count as main words when they appear (even if they're not in the main list),
  are shown with a ★ and in their own group in the word list.
- **min_words**: at least this many theme words (required included) on the board.
- Blocked words can't be theme words. Words under 4 letters are ignored.
- **settings** (optional): any setting for this theme's days, e.g.
  `{"main_zipf": 4.5, "min_main": 70, "max_main": 140}`. A date entry in the schedule wins.
- Many required words are packed so they share letters (see `themes/yomkippur.json`:
  7 words on a 4x4). A board packed with common letters holds hundreds of words, so
  such themes set `main_zipf`: only words at least that common count as MAIN, the rest
  become BONUS.

The app shows the theme title under the name, and a special shape's name.

```python
from wordgame import Board, Game
import json
board = Board.from_json(json.load(open("boards/daily/2026-09-20.json", encoding="utf-8")))
game = Game(board)
game.submit_path([5, 6, 2, 3])    # cells dragged over (reading order, holes skipped)
game.submit_word("שלום")          # or typed
game.progress                     # {'main_found', 'main_total', 'bonus_found', 'score', 'complete'}
```

`submit_*` returns a status: `main`, `bonus`, `already_found`, `not_a_word`,
`bad_path` or `too_short`, plus the word's proper spelling and points.

Each board JSON has the shape (`mask`), the letters in cell order, a readable `grid`
(`·` = no cell), the main and bonus words with one path each, and the theme if any.

## How it works

- **Word lists.** Valid words = Hspell forms (no prefixes like ו/ה/ב) + infinitives
  (ל + stem, e.g. לתרום) + the hand lists above. Each form is classified with Hspell's
  morphology (`analyze_hspell.py` -> `data/morph.tsv`) and frequency comes from `wordfreq`:
  - **Main:** dictionary headwords and infinitives (נעול, פגיע, פתיר, לתרום) at Zipf >= 2.5,
    and ordinary inflections (ספרים, מורכבת, למדו) at Zipf >= 3.3.
  - **Bonus:** construct forms (גינת, פגיעת) and possessive suffixes (לועי, ספריו), rarer
    forms down to Zipf 1.5, and slang.
  - **Blocked:** every form of the words in `blocked_lemmas.txt` / `blocklist.txt`
    (matched on Hspell's lemma), written to `data/blocked_forms.txt`.
- **Final letters.** ך ם ן ף ץ are shown and matched as כ מ נ פ צ. Players get the
  proper spelling back.
- **Generation.** Simulated annealing: start from random letters (weighted by how
  common they are), change or swap cells, re-count words, repeat until the board:
  - hits that day's target (a random number inside the shape's range, +- the spread),
  - has a long enough main word, and enough long (6+ letter) main words,
  - meets the letter-variety rules,
  - uses every cell in some main word,
  - contains no blocklisted word,
  - and, on themed days, keeps the required words and has enough theme words.
- **Daily.** The seed is a hash of the date plus a salt, so the same date gives the
  same board everywhere. Boards depend on the word lists, so pre-generate and keep
  the JSON files if past days must never change.

## Tuning

- **Harder or easier.** `preset(size, min_main=..., max_main=...)`, or the matching
  flags on `generate_days.py`. To change a size's defaults, edit `PRESETS` in
  `wordgame.py`.
- **What counts as "common".** `python build_wordlists.py --main-zipf 4.2`. A higher
  value gives fewer main words per board.
- **Word fixes.** Edit the `data/*.txt` hand lists, then rerun `build_wordlists.py`
  and regenerate future days.
