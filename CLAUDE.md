# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ריבועון: a daily Hebrew Squaredle-style word grid. Python 3.10+, **standard library only**. Everything runs offline except `build_wordlists.py` (needs `pip install wordfreq`) and `analyze_hspell.py` (needs a compiled Hspell 1.4 with `--enable-linginfo`).

Further docs: `README.md`, `docs/BOARDS.md` (how-to for boards/shapes/themes — read before changing boards), `docs/ALGORITHM.md`, `docs/GAME.md`, `skills/ribuon-boards/SKILL.md`.

## Commands

```bash
python -m unittest test_wordgame -v                          # all tests (~2 min: they generate boards)
python -m unittest test_wordgame.TestThemes -v               # one class
python -m unittest test_wordgame.TestBasics.test_neighbors   # one test

python generate_days.py --days 60                  # fill upcoming days by schedule.json (skips existing files)
python generate_days.py --start YYYY-MM-DD --days N --force   # regenerate a range
python generate_days.py --date YYYY-MM-DD --shape heart       # one special day (written into schedule.json; --no-save to just try)
python generate_days.py --date YYYY-MM-DD --theme sukkot      # themed day
python generate_days.py --show YYYY-MM-DD | --shapes | --presets
python build_wordlists.py                          # rebuild data/main.txt, bonus.txt, blocked_forms.txt (online)
```

React app + API:

```bash
docker compose up --build                          # frontend http://localhost:5174, API 127.0.0.1:8001
cd frontend && npx tsc -b                          # typecheck
docker compose exec -w /repo backend python -m unittest test_wordgame   # tests on Python 3.12
```

## Architecture

- **`wordgame.py`** is the whole engine; the other scripts are thin CLIs over it.
  - `normalize()` strips niqqud and folds final letters (ך ם ן ף ץ → כ מ נ פ צ). All matching, trie keys and board letters use normalized forms; the proper spelling is returned to the player.
  - `Shape` is a mask of rows (`X` = cell, `.` = hole). Cells are numbered in reading order **skipping holes**; `neighbors(shape)` gives 8-way adjacency and holes block paths. Paths everywhere are lists of these cell indices.
  - `Lexicon.load("data")` builds one trie over `main.txt`, `bonus.txt`, `blocklist.txt`, `blocked_forms.txt` with precedence BLOCKED > MAIN > BONUS. `lex.common_only(zipf)` and `lex.with_main(words)` derive variants (used for `main_zipf` and theme words).
  - `Settings` holds the generation constraints. Squares use `PRESETS` via `preset(n)`; other shapes use `settings_for(shape, lex)`, which **calibrates** ranges by solving random boards of that shape. Any field can be overridden.
  - `generate()` = simulated annealing (`_anneal`, cost via `_evaluate`) toward a MAIN-word count target plus rules (longest word, long-word count, letter variety, every cell used, no blocked word). Theme `required` words are placed first (`_place_words`) and frozen. If `relax` is on, failed rounds loosen rules and record them in `board.relaxed`.
  - `seed_for()`/`daily_board()`: seed = sha256 of salt + layout + date, so boards are deterministic **given the word lists and settings**. The 5x5 key format is kept for backward compatibility — don't change seed keys.
  - `Board` (JSON round-trip via `to_json`/`from_json`, `save_board`) and `Game` (`submit_path`/`submit_word`, scoring via `word_points`, bonus words worth double).
- **`generate_days.py`**: `plan_for()` merges `schedule.json` layers (default < weekday < date). Shape precedence: date's own shape > theme's `shape` > weekday/default; a list of shapes rotates by ISO week. A theme's `settings` apply unless the date entry sets the same key. Generation runs in a process pool (`_init` loads the Lexicon per worker).
- **`backend/`** (FastAPI, its own deps in `backend/requirements.txt`): imports `wordgame.py` and serves `boards/daily`. Future days return 404. The board endpoint never sends word lists: swipes are checked server-side (`POST /boards/{date}/check` takes cell indexes on the *unrotated* board). Progress is saved in SQLite, keyed by `X-Player-Id` (an anonymous id from the browser, to be replaced by login in `deps.current_player`). `/define/{word}` scrapes Milog (it has no CORS).
- **`frontend/`** (Vite + React + TS): base components in `src/components/` (Button, Pill, Chip, Modal, ProgressBar, Tile), screens in `src/features/`, game state in `src/state/useGame.ts`, progress in `src/state/progressStore.ts` (localStorage first, synced to the API). `lib/layout.ts` maps rotated cells back to the stored ones (`layout.base`).
- **Word data pipeline**: `sources/` (Hspell lists, AGPL) → `analyze_hspell.py` → `data/morph.tsv` → `build_wordlists.py` (+ hand lists `slang.txt`, `extra_spellings.txt`, `function_words.txt`, `exclude.txt`, `blocklist.txt`, `blocked_lemmas.txt`) → `data/main.txt`, `data/bonus.txt` (`word<TAB>zipf`), `data/blocked_forms.txt`. Blocking works on Hspell lemmas, so every inflection of a blocked lemma is blocked.

## Ground rules

- `boards/daily/*.json` are the record of played days. **Never regenerate today or past days** unless explicitly asked (it resets players' saved progress). Word-list or setting changes should only be applied to future days (`--start <tomorrow> --force`).
- After any board change: run the tests.
- `test_wordgame.py` generates real boards, so the full run takes minutes. Only run
  it when the change can reach board generation — `wordgame.py`, `generate_days.py`,
  `schedule.json`, `shapes.json`, `themes/`, `data/` or the test file itself.
  **Don't** run it for `frontend/`, `backend/` or docs; use `cd frontend && npx tsc -b`
  for the frontend instead. When only one area moved, run that class (`TestThemes`,
  `TestShapes`, `TestSchedule`, `TestGame`, …) and save the full suite for the end.
- Don't add third-party dependencies to the game side (`wordgame.py`, `generate_days.py`, tests).
