# How boards are made

Everything lives in `wordgame.py` (standard library only).

## 1. Word lists (`build_wordlists.py`, run once, online)

1. **All valid forms** come from Hspell 1.4 (every inflection, without prefixes like ו/ה/ב),
   plus infinitives (ל + stem: לתרום), plus hand lists (`data/extra_spellings.txt`,
   `data/function_words.txt`, `data/slang.txt`).
2. **Grammar per form** (`data/morph.tsv`, from `analyze_hspell.py`): base form,
   plain inflection, bound (construct / possessive suffix), infinitive, proper name; and
   its lemma(s).
3. **Frequency**: each form gets a Zipf score from `wordfreq` (≈ log10 of uses per
   billion words; 6 = very common, 3 = uncommon).
4. **Sorting**:
   - MAIN: base forms and infinitives at Zipf ≥ 2.5; plain inflections at ≥ 3.3.
   - BONUS: bound forms, rarer forms down to 1.5, and slang.
   - BLOCKED: `data/blocklist.txt` words and every form of the lemmas in
     `data/blocked_lemmas.txt`. A blocklist word pulls in its lemma only when that
     lemma is itself blocked, so פרחה (slang) doesn't take פרח (flower) with it.
   - Proper names and `data/exclude.txt` are dropped.
5. Output: `data/main.txt`, `data/bonus.txt` (`word<TAB>zipf`), `data/blocked_forms.txt`.

Letters are normalized before matching: final forms fold to regular ones (ם → מ).

## 2. Finding every word on a board (the solver)

The lists are loaded into a **trie** (a letter tree). A depth-first search starts at
every cell and walks to neighbouring cells not yet used in this path, following the trie
only as long as the letters so far are a prefix of some word. Dead ends are cut
immediately, so a 4×4 board (millions of raw paths) is solved in about a millisecond.
The search also records which cells take part in some main word (for "every cell used"
and the grey letters).

**Shapes** are masks (`X` = cell, `.` = empty). Cells are numbered in reading order;
each cell's neighbours are the up-to-8 touching cells that exist in the mask, so any
drawable shape works with the same solver.

## 3. Generating a board (simulated annealing)

Goal: a board meeting the day's **settings**:

| Setting | Meaning |
|---|---|
| `min_main` / `max_main`, `spread` | Main-word range; each day aims at a random target inside it, ± spread |
| `min_longest`, `max_longest` | The day's longest main word: each day picks a length in this range, and no *main* word is longer (bonus words aren't capped). Setting only `min_longest` clears the ceiling |
| `long_len`, `min_long_words`, `max_long_words` | Long words (`long_len`+ letters): each day picks a target count in this range and lands within ±1 of it |
| `all_cells_used` | Every letter is part of some main word |
| `max_same_letter`, `min_distinct` | Letter variety |
| `main_zipf` | Only words at least this common count as MAIN (for crowded boards) |
| `max_bonus_ratio` | At most this many bonus words per main word (default 1.0, 0 = off; ignored with `main_zipf`) |
| blocked words | Never allowed on a board |
| theme `min_words` | At least N theme words |

Each rule adds to a **cost**; cost 0 = a valid board.

1. Fill the cells with random letters, weighted by how often letters appear in main words.
2. Repeat thousands of times: change one letter, or swap two; re-solve; compute the cost.
   Keep the change if the cost went down, and sometimes even if it went up. That chance
   shrinks as the run goes on ("temperature"), which lets the search escape dead ends early
   and settle at the end.
3. Stop at cost 0, or restart from new random letters (up to `max_attempts`).
4. **Relax**: if nothing reaches 0, the hardest rules are loosened step by step (fewer
   long words, wider range), and the board records what was loosened.

**Calibration.** Squares use fixed presets (4×4: 40–90 main words, longest ≥ 7, 6 long
words). Irregular shapes hold far fewer words than a square of the same size, so their
ranges are measured: 120 random boards of the shape are solved and the range is set from
the results.

## 4. Themes: placing required words

Required theme words are laid down **before** annealing, and their cells are locked.

- Longest words first. For each word, many random paths are tried. A path can reuse a
  cell that already holds the right letter, so words overlap (סליחה and סליחות share
  four cells).
- Each candidate path is scored: reused cells ×3, plus new cells touching the placed
  area. The best one is kept.
- The whole packing is repeated and the tightest one (fewest cells) kept; on small
  boards every restart gets a fresh packing.
- Theme words count as MAIN even if they're not in the main list.

A board packed with theme words is full of common letters and can hold hundreds of
words, so such themes set `main_zipf` to keep the main list at a normal size (the Yom
Kippur 4×4 uses 4.0 and gets about 70 main words).

## 5. Daily determinism

The seed is a hash of the date + a salt (+ the shape and theme). The same inputs
always give the same board. Boards also depend on the word lists, so they are
pre-generated and stored as JSON (`boards/daily/`): editing lists never changes a
day already made.

## 6. The app

The backend serves the stored boards from `boards/daily/` and picks today's by Israel
date; future days 404. Swiped paths are checked server-side, so no word list and no
solver ever reaches the browser. The frontend keeps progress in `localStorage` and
syncs it to the API.
