"""The leaderboard: who did best on a day, and who keeps coming back.

  GET /api/leaderboard/{date}          {day: {...}, streaks: {...}}
  GET /api/leaderboard/{date}/stats    {avgWords, avgFraction}: everyone's average, no names or counts

Only players who chose a nickname (an account's, see auth.py) are listed. Every
player, listed or not, also gets their own place (`me`), counted among the listed.
`day_stats` counts everyone, listed or not, but names no one.

Both lists read `on_day` (progress.py): what a player found on the board's own
day, so archive play never counts.

- day: most main words, then most bonus words, then who finished first.
- streaks: days in a row with a main word found on the day, up to today. A
  streak still counts through yesterday until today's board is played.

ריבועוני ("mini-<date>", logged-in players only) has its own of both: its rows
in `on_day` are filed under its id, so the two games never mix.
"""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException

from . import config
from .boards import MINI, Day, is_mini, mini_dates, playable_dates
from .deps import accounts, current_player, current_user, day, repo

router = APIRouter(prefix="/api/leaderboard")

TOP = 50
# fewer players than this and the day has no average: it would be mostly the player's own
STATS_MIN = 2


def _maybe_player(user: dict | None = Depends(current_user),
                  x_player_id: str | None = Header(default=None),
                  ribuon_session: str | None = Cookie(default=None)) -> str | None:
    """The asking player, or None when they can't be told (no id, a dead session):
    the lists are public, only `me` needs to know who asks."""
    try:
        return current_player(user, x_player_id, ribuon_session)
    except HTTPException:
        return None


def _listed() -> dict[str, str]:
    """player key -> nickname, for everyone on the leaderboard."""
    return {f"user:{uid}": nick for uid, nick in accounts().nicknames().items()}


def _ranked(rows: list[dict], key, listed: dict[str, str], me: str | None) -> dict:
    """The listed rows best first, each with its place (ties share it), and the
    asker's own row and place among them. Fields starting with _ only sort."""
    public = lambda r: {k: v for k, v in r.items() if k != "player_id" and not k.startswith("_")}
    rows.sort(key=key)
    shown = [r for r in rows if r["player_id"] in listed]
    top, place = [], 0
    for i, r in enumerate(shown):
        if i == 0 or key(r) != key(shown[i - 1]):
            place = i + 1
        if i < TOP:
            top.append({"rank": place, "name": listed[r["player_id"]], "me": r["player_id"] == me, **public(r)})
    mine = next((r for r in rows if r["player_id"] == me), None)
    out_me = None
    if mine:
        out_me = {"rank": 1 + sum(key(r) < key(mine) for r in shown), "listed": me in listed, **public(mine)}
    return {"players": len(shown), "top": top, "me": out_me}


def day_board(d: Day, listed: dict[str, str], me: str | None) -> dict:
    rows = [{"player_id": r["player_id"], "main": r["main"], "bonus": r["bonus"], "done": r["done_at"] is not None,
             "_at": r["done_at"] or ""} for r in repo().on_day(d.date)]
    # the finish time only breaks a tie in both counts; unfinished rows all share "" there
    key = lambda r: (-r["main"], not r["done"], -r["bonus"], r["_at"])
    return {"date": d.date, "mainTotal": len(d.board.main), **_ranked(rows, key, listed, me)}


def streak(played: set[str], dates: list[str], today: str) -> int:
    """Days in a row in `played`, back from today (or from yesterday while today
    isn't played yet). `dates` are the board days, oldest first."""
    back = [x for x in reversed(dates) if x <= today]
    if back and back[0] == today and today not in played:
        back = back[1:]
    n = 0
    for x in back:
        if x not in played:
            break
        n += 1
    return n


def streak_board(listed: dict[str, str], me: str | None, mini: bool = False) -> dict:
    """The streaks of one game: ריבועון's, or with `mini` ריבועוני's."""
    today, dates = config.today(), mini_dates() if mini else playable_dates()
    if mini:
        today = MINI + today
    who = list(listed) + ([me] if me and me not in listed else [])
    played = {p: {x for x in days if is_mini(x) == mini} for p, days in repo().days_played(who).items()}
    rows = [{"player_id": p, "streak": streak(days, dates, today), "days": len(days)}
            for p, days in played.items()]
    rows = [r for r in rows if r["streak"] > 0]
    return _ranked(rows, lambda r: (-r["streak"], -r["days"]), listed, me)


def day_stats(d: Day) -> dict:
    """How everyone did on the day, for the progress bar: their average words and
    share of the main letters (0..1), or nulls while too few have played. How
    many played is never sent: a quiet day shouldn't look empty."""
    t = repo().day_totals(d.date)
    total = d.main_letters()
    if t["players"] < STATS_MIN or not total:
        return {"avgWords": None, "avgFraction": None}
    return {"avgWords": round(t["words"], 1), "avgFraction": round(min(1, t["letters"] / total), 4)}


@router.get("/{date}")
def leaderboard(d: Day = Depends(day), me: str | None = Depends(_maybe_player)):
    listed = _listed()
    return {"day": day_board(d, listed, me), "streaks": streak_board(listed, me, d.mini)}


@router.get("/{date}/stats")
def stats(d: Day = Depends(day)):
    return day_stats(d)
