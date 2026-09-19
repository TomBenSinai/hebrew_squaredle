# Creating boards: a how-to

All commands run from the project folder with Python 3.10+. Nothing needs the internet.

## Every day, by the schedule

```bash
python generate_days.py --days 60                      # the next 60 days (skips days already made)
python generate_days.py --start 2026-10-01 --days 30 --force   # remake a range
python build_web.py                                    # rebuild web/index.html
```

Deploy `web/index.html` (a single file). Keep `boards/daily/` under version control:
it's the record of what every day was.

## Look at a day

```bash
python generate_days.py --show 2026-09-19
```

## Make one day special

```bash
python generate_days.py --date 2026-10-03 --shape heart
python generate_days.py --date 2026-10-03 --shape "XXXXX/X...X/XXXXX"      # inline shape
python generate_days.py --date 2026-10-03 --min-long-words 8               # any setting
```

`--date` always overwrites that day and records the change in `schedule.json`, so later
bulk runs keep it. `--no-save` tries it without recording.

## The schedule (`schedule.json`)

```json
{
  "default":  {"shape": "4x4"},
  "weekdays": {"saturday": {"shape": ["heart", "diamond", "star"]}},
  "dates":    {"2026-09-26": {"theme": "sukkot"},
               "2026-10-01": {"shape": "heart", "min_long_words": 8}}
}
```

Most specific wins: date > weekday > default. A list of shapes rotates week by week.

## Shapes (`shapes.json`)

```json
"heart": {"title": "לב", "mask": [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."]}
```

`X` = cell, `.` = gap. `python generate_days.py --shapes` draws them all. Irregular
shapes calibrate their own word range.

## A new theme (`themes/<name>.json`)

```json
{
  "title": "יום כיפור",
  "shape": "4x4",
  "required": ["כיפור", "כפרה", "שופר", "וידוי", "נדרים", "קדושה", "יונה"],
  "words": ["סליחה", "תשובה", "תפילה", "..."],
  "min_words": 7,
  "settings": {"main_zipf": 4.0, "min_longest": 6, "min_long_words": 3}
}
```

- `required`: always placed on the board (packed so they share letters).
- `words`: count as main words and get a ★ if they happen to appear.
- `min_words`: at least this many theme words on the board.
- `settings`: any generation setting for this theme's days.
- `shape`: default shape for the theme (a date entry can override).

Then: `python generate_days.py --date 2026-09-19 --theme yomkippur` and `python build_web.py`.

### Recipe for a good theme

1. **Collect** 15–30 topic words of 4+ letters; check they exist in the lists:
   ```bash
   python -c "from wordgame import *; L=Lexicon.load('data'); [print(w, L.lookup(w)) for w in 'שופר כיפור'.split()]"
   ```
   (`main`/`bonus` = fine, `blocked` = can't be used, `None` = unknown, still allowed as a theme word).
2. **How many fit?** A 4×4 holds about 5–8 required words, a 5×5 about 8–10, a 6×6 about 15.
   Test a set before committing:
   ```bash
   python -c "import random; from wordgame import *; from wordgame import _place_words; \
   print(_place_words('כיפור כפרה שופר וידוי'.split(), Shape.square(4), random.Random(1)))"
   ```
   `None` = doesn't fit; drop the longest word or one with rare letters, or use a
   bigger shape. Words sharing letters (כיפור/כפרה, סליחה/סליחות) pack best.
3. **Put the rest in `words`**, not `required`.
4. **Generate and check** the main count. If it's far above the usual range (packed
   boards are crowded), add `"main_zipf"` (4.0 for a 4×4 with 7 words, 4.5 for a
   6×6 with 15). If generation fails, lower `min_long_words` / `min_longest`, or raise
   `max_same_letter` in the theme `settings`.

## Settings reference

`python generate_days.py --help` and `--presets`. Every setting is also a flag:
`--min-main --max-main --spread --min-longest --long-len --min-long-words
--all-cells-used --max-same-letter --min-distinct --main-zipf --max-steps
--max-attempts --relax`.

## Fixing words

- A word shouldn't count: add it to `data/exclude.txt` (names) or
  `data/blocklist.txt` / `data/blocked_lemmas.txt` (offensive).
- A missing word: `data/extra_spellings.txt` or `data/function_words.txt`; slang in
  `data/slang.txt`.
- Then `python build_wordlists.py` (needs `wordfreq`, online) and regenerate **future**
  days only.
