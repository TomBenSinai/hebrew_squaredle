# ריבועון: the game

A daily Hebrew word-search puzzle in the style of Squaredle. Everyone gets the same
board on the same day (Israel time).

## Rules

- **Swipe** across touching letters to form a word. Letters touch in all 8 directions
  (sideways, up/down, diagonals), and a path may turn any way it likes.
- **Each cell once** per word. A gap in the shape (on special-shape days) can't be crossed.
- **4 letters or more.** Final letters (ך ם ן ף ץ) are the same tiles as כ מ נ פ צ:
  swipe מ for ם; the game shows the proper spelling.
- **Main words** are the common words of the day. Find all of them to finish the board.
- **Bonus words** are rarer forms, construct and possessive forms (גינת, ספריו), and
  slang. They score double but aren't needed to finish.
- **Theme words (★)**, on themed days, belong to the day's topic (e.g. יום כיפור) and are
  highlighted in their own group.

## Screen

| Part | What it does |
|---|---|
| Header | Name, date, board number, the day's shape (on special shapes) and theme chip |
| Big counter | Main words found / total. The bar under it fills right to left, weighted by letters, so long words move it more |
| Readout | The word being swiped, then the result: main, bonus, ★ theme, already found, not a word. Tap the result to see the definition |
| Board | Swipe only (no tapping letters one by one). Letters that no remaining main word uses turn grey |
| סיבוב | Rotates the board 90° (same board, new view; helps you see words) |
| המילים | Found words, grouped by length; theme words first; bonus words in their own section. Unfound words are never revealed; it only says how many are left |
| ארכיון | Every past day with your progress; tap to play it. Future days stay hidden |
| ? | The rules, in the app's own words. It opens by itself on a first visit (`rivuon:help-seen` in `localStorage`) and from the header any time after |
| Definition card | Tap any found word: a short definition (written by Claude when the page runs on claude.ai), a link to the full Milog entry, and "show on board" |

Progress is saved per day in the browser (`localStorage`, key `otiot:<date>`), so a
refresh or a later visit continues where you stopped.

## Days

- Weekdays: a 4×4 board with 40–90 main words, at least one 7-letter word and several
  6-letter words.
- Saturdays: a special shape (heart, diamond, מגן דוד, ring...), rotating weekly.
- Holidays and chosen dates: a theme, and optionally a shape.

`schedule.json` decides all of this; see [BOARDS.md](BOARDS.md).
