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
  slang. They aren't needed to finish; once you find some, their count shows as +N
  beside the main count. (The server still scores them double, but the screen shows no points.)
- **Theme words (★)**, on themed days, belong to the day's topic (e.g. יום כיפור) and are
  highlighted in their own group.

## Screen

| Part | What it does |
|---|---|
| Header | Name, date, board number, the day's shape (on special shapes) and theme chip; buttons for the account, ? and light/dark (and חזרה להיום on an archive day) |
| Big counter | Main words found / total. The bar under it fills right to left, weighted by letters, so long words move it more |
| Readout | The word being swiped, then the result: main, bonus, ★ theme, already found, not a word. Tap the result to see the definition |
| Board | Swipe only (no tapping letters one by one). Letters that no remaining main word uses turn grey |
| Under the board | סיבוב on one side; ארכיון and 🏆 at the other end, near the thumb on a phone |
| סיבוב | Rotates the board 90° (same board, new view; helps you see words) |
| המילים | Found words, grouped by length; theme words first; bonus words in their own section. Unfound words are never revealed; it only says how many are left |
| ארכיון | Every past day with your progress; tap to play it. Future days stay hidden |
| 🏆 | The leaderboard (shown only when login is on). See below |
| Finish | Finding the last main word sends a gold wave across the board, then a card rains the board's letters as confetti: the words and bonus words found and, on today's board, the player's place and streak, and a button to the leaderboard. A player who isn't on the list gets a gold card instead: "אם הייתם מחוברים, הייתם במקום ה־N היום. לא חבל שלא תופיעו בטבלת המובילים?" (logged in without a nickname: "עם כינוי, ..."), with התחברות / בחירת כינוי as the main button. An archive board says it doesn't count for the leaderboard |
| Tutorial | A first visit starts on this page instead of the game, in four steps on a practice board with gaps holding only שלום and מוצר: swipe שלום (and see מ turn into ם at the end); find מוצר after ש and ל grey out; open the word list from the counter and tap a word for its definition; then meet the rotate, archive and ? buttons (? holds all the rules) and go into the game. A small דילוג in the header skips it. Remembered as `ribuon:seen:tutorial` (older players' `ribuon:help-seen` counts too) |
| ? | The rules, in the app's own words, from the header any time |
| First-time cards | One card at a time, the first time a player meets each: a hint opening, a bonus word (what bonus words are, with גינה / גינת), a ★ theme word (what theme words are and where they show in the list). Remembered as `ribuon:seen:<name>` (`hint:<id>`, `bonus`, `theme`), falling back to `sessionStorage` and memory where `localStorage` can't be written |
| Definition card | Tap any found word: a short definition (scraped from Milog by the backend), a link to the full Milog entry, and "show on board" |

Progress is saved per day in the browser (`localStorage`, key `otiot:<date>`), so a
refresh or a later visit continues where you stopped. It is also sent to the server,
under an anonymous id the browser makes up (`ribuon:player`).

## Account (optional)

The person button in the header (shown only when the server offers a way to log in)
opens התחברות: continue with Google, or get a login link by email. The login that
makes the account moves what this browser played so far into it. Logging in to an
account that already exists doesn't: that device drops its anonymous progress and
shows the account's. From then on every device logged in to the account shares the
same progress, merged word by word (a word found anywhere stays found).
Logged in, the button shows the player's initial; it opens the account card:
days saved, a nickname for the leaderboard, התנתקות (the progress stays in the account, this device starts afresh)
and מחיקת החשבון (deletes the account and its progress, after a confirmation).
On a narrow phone viewing an archive day the button makes room for חזרה להיום and
waits on today's page.

## Leaderboard

The trophy under the board opens טבלת המובילים. Until a player first opens it, the
trophy wears an amber dot, and today's page shows a "חדש!" note just above that row
pointing down at it (once; closing it counts as seen, `ribuon:seen:leaders`). The older
login note waits until this one is gone. It has two tabs:

- **היום**: today's board, by main words found; a tie goes to whoever finished the
  board first, then to more bonus words. Equal rows share a place.
- **רצפים**: days in a row on which the player found at least one main word on that
  day's own board. A streak stays alive through yesterday until today is played.

Only progress saved on the board's own day (Israel time) counts, so playing old days
from the archive can't climb a ranking or fill a streak gap. Only accounts that chose
a nickname (in the account card: 2–20 letters or digits, unique) are listed, top 50.
Everyone else still sees the place they would have, as a dashed "כאן הייתם" row put
into the list where they'd rank, and a button to log in or pick a nickname. Clearing
the nickname takes the player off the list.

## How everyone did

A small globe rides the progress bar at the average progress of everyone who played
that board on its own day (by letters, like the bar). It slowly turns, ripples once
when it appears, and turns gold once the player's fill passes it. Tapping or hovering
it shows the average in words, and "אתם מעל הממוצע" when the player is ahead. It
counts every player, logged in or not, but never says how many played or finished
(the API doesn't send those counts), so a quiet day doesn't look empty; with fewer
than two players it stays hidden. It refreshes every 30
seconds while the page is open.

## Days

- Weekdays: a 4×4 board with 40–90 main words, at least one 7-letter word and several
  6-letter words.
- Saturdays: a special shape (heart, diamond, מגן דוד, ring...), rotating weekly.
- Holidays and chosen dates: a theme, and optionally a shape.

`schedule.json` decides all of this; see [BOARDS.md](BOARDS.md).
