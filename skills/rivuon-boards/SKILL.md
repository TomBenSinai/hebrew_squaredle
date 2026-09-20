---
name: rivuon-boards
description: Create, theme, and publish daily boards for ריבועון (the Hebrew Squaredle-style word game) — scheduling days, special shapes, and holiday themes. Use when asked to make boards, a themed/holiday day, a new shape, or to fix words in the game.
---

# ריבועון boards

The project folder holds `wordgame.py` (core), `generate_days.py` (CLI),
`schedule.json`, `shapes.json`, `themes/*.json`, `data/*` (word lists),
`boards/daily/*.json` (stored days), and the app in `backend/` and `frontend/`.
Full references: `docs/BOARDS.md` (how-to), `docs/ALGORITHM.md` (how it works),
`docs/GAME.md` (rules and UI). Read `docs/BOARDS.md` before the first change.

## Ground rules

- Python 3.10+, standard library only. Everything except `build_wordlists.py` runs offline.
- Stored boards are the record of past days. **Never regenerate a day that has already
  been played** (today or earlier) unless the user asks for that day specifically; tell
  them it resets that day's saved progress.
- Word-list changes (`data/*.txt` + `python build_wordlists.py`, needs `wordfreq`
  online) affect only days generated afterwards; regenerate future days only
  (`--start <tomorrow> --days N --force`).
- After any board change: `python -m unittest test_wordgame`.

## Tasks

### Fill upcoming days
```bash
python generate_days.py --days 60        # skips days already made
```

### Make one day special (shape and/or settings)
```bash
python generate_days.py --date YYYY-MM-DD --shape heart
python generate_days.py --date YYYY-MM-DD --shape "XXXXX/X...X/XXXXX"
```
`--date` overwrites that day and records it in `schedule.json`.

### Holiday / themed day
1. Ask for or choose the holiday, date, and shape (default 4×4). Collect 15–30 topic
   words of 4+ letters (no prefixes like ה/ו/ב, prefer base forms: שופר not השופר).
2. Check each word: `Lexicon.load('data').lookup(w)` — drop `blocked`; `None` is fine
   (it becomes a theme word anyway) but prefer real dictionary forms.
3. Pick the **required** subset that fits the shape. Capacity: 4×4 ≈ 5–8 words,
   5×5 ≈ 8–10, 6×6 ≈ 15. Test with `_place_words(words, shape, random.Random(1))`
   (`None` = doesn't fit). Words sharing letters pack best; drop long words with rare
   letters first. A greedy search helps: shuffle candidates, add each one if the set
   still fits, repeat with a few seeds, keep the biggest set.
4. Write `themes/<name>.json`: `title`, `shape`, `required`, the remaining words in
   `words`, `min_words` = number of required words, and `settings` if needed.
5. `python generate_days.py --date YYYY-MM-DD --theme <name>`, then
   `--show YYYY-MM-DD`: check the main-word count and which ★ words landed.
6. **Crowded board?** Packed theme words use common letters, so main counts can reach
   hundreds. Add `"settings": {"main_zipf": ...}` so only common words are MAIN:
   4.0 for a 4×4 with ~7 required words (≈ 50–75 main), 4.5 for a 6×6 with 15
   (≈ 90). Measure before choosing: solve a few packed boards and count main words
   at several thresholds.
7. **Generation fails** (cost > 0) → the required words leave too little freedom:
   loosen in the theme `settings`: `min_longest` 6, `min_long_words` 2–3,
   `max_same_letter` 3, `min_distinct` 10. Or require fewer words. Setting a
   `min_` on its own drops the shape's matching `max_` ceiling, which is usually
   what a packed board needs — to keep the day-to-day range, set both.
8. Rebuild, test, publish; report the board, the theme words on it and the main count.

### New shape
Add to `shapes.json`: `"name": {"title": "<Hebrew name>", "mask": ["X.X", ...]}`.
View with `--shapes`. Irregular shapes self-calibrate; check `--show` output for a
"loosened" note and adjust settings if too many rules were relaxed.

### Word fixes
- Offensive word on a board: add to `data/blocklist.txt` (that word) or
  `data/blocked_lemmas.txt` (every form). A blocklist entry expands only through lemmas
  that are themselves blocked — after rebuilding, diff `data/blocked_forms.txt` to see
  exactly what changed.
- Missing word: `data/extra_spellings.txt` / `data/function_words.txt`; slang in
  `data/slang.txt` (always bonus).
- Proper name counted as a word: `data/exclude.txt`.

## Checks before finishing
- `python -m unittest test_wordgame` passes.
- `--show` for every changed day: no blocked words, sensible main count, theme words present.
- Open the app at phone width: board fits the screen, theme chip shows.
