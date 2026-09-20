#!/usr/bin/env python3
"""
Pre-generate daily boards as JSON: boards/daily/YYYY-MM-DD.json

Every day's shape and theme come from schedule.json (square on weekdays, a
special shape on Saturday, themes on chosen dates...). Shapes live in
shapes.json, themes in themes/*.json.

  python generate_days.py --days 30                         # the next 30 days, by the schedule
  python generate_days.py --start 2026-09-01 --days 212 --force
  python generate_days.py --date 2026-09-19 --shape heart   # make one day special
  python generate_days.py --date 2027-05-12 --theme independence
  python generate_days.py --date 2026-09-19 --shape "XXXXX/X...X/XXXXX" --min-long-words 4
  python generate_days.py --shapes                          # show the shape library
  python generate_days.py --show 2026-09-19                 # print a stored board

--date makes a one-day change and records it in schedule.json (so later bulk
runs keep it); add --no-save to just print the board (nothing is written).
--shape / --theme / --size and any setting flag apply to every day of the run.

Days that already have a file are skipped unless --force.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from dataclasses import asdict, fields, replace
from datetime import date, timedelta
from multiprocessing import Pool
from pathlib import Path

from wordgame import (PRESETS, Board, Lexicon, Settings, Shape, Theme, daily_board,
                      format_grid, save_board, settings_for)

HERE = Path(__file__).parent
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_lex: Lexicon | None = None

# Settings fields you can override from the command line (--min-main etc.)
SKIP = {"size", "mask", "shape_name", "theme"}
TUNABLE = [f.name for f in fields(Settings) if f.name not in SKIP]
HELP = {
    "min_main": "fewest MAIN words on a board",
    "max_main": "most MAIN words on a board",
    "spread": "each day aims at a random target in the range, +- this much",
    "min_longest": "shortest the day's longest MAIN word may be",
    "max_longest": "longest it may be (each day picks a length in between), 0 = no limit",
    "long_len": "what counts as a long word (letters)",
    "min_long_words": "fewest long MAIN words on a board",
    "max_long_words": "most long MAIN words (each day aims at a count in between, +-1), 0 = no limit",
    "all_cells_used": "1 = every letter is part of some MAIN word, 0 = allow unused letters",
    "max_same_letter": "no letter on more cells than this",
    "min_distinct": "at least this many different letters",
    "max_steps": "annealing steps per attempt",
    "max_attempts": "restarts before giving up",
    "main_zipf": "only words at least this common count as MAIN (e.g. 4.5), 0 = off",
    "max_bonus_ratio": "at most this many BONUS words per MAIN word (e.g. 1.0), 0 = off",
    "relax": "1 = loosen the rules step by step if a shape can't meet them, 0 = fail instead",
}


# ------------------------------------------------------------------ shapes / themes / schedule

def load_shapes() -> dict[str, dict]:
    lib = json.loads((HERE / "shapes.json").read_text(encoding="utf-8"))
    return {k: v for k, v in lib.items() if not k.startswith("_")}


def resolve_shape(spec: str, lib: dict) -> Shape:
    """A library name, 'NxN' / 'RxC', or an inline mask ('.X./XXX/.X.')."""
    spec = spec.strip()
    if spec in lib:
        return Shape(tuple(lib[spec]["mask"]), spec)
    if "x" in spec and spec.replace("x", "").isdigit():
        r, c = (int(v) for v in spec.split("x"))
        return Shape.square(r) if r == c else Shape.rect(r, c)
    if "/" in spec or "\n" in spec:
        return Shape.parse(spec, "custom")
    raise SystemExit(f"unknown shape {spec!r}: use a name from shapes.json "
                     f"({', '.join(lib)}), 'NxN', or a mask like '.X./XXX/.X.'")


def load_theme(name: str) -> Theme:
    path = HERE / "themes" / f"{name}.json"
    if not path.exists():
        have = ", ".join(p.stem for p in sorted((HERE / "themes").glob("*.json")))
        raise SystemExit(f"no theme {name!r} in themes/ (have: {have})")
    return Theme.load(path)


def load_schedule() -> dict:
    path = HERE / "schedule.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"default": {"shape": "4x4"}}


def plan_for(day: date, schedule: dict, extra: dict | None = None) -> dict:
    """Merge default < weekday < date entries into one plan for the day.
    `extra` (one-off command-line flags) counts as part of the date entry."""
    wd = WEEKDAYS[day.weekday()]
    layers = [schedule.get("default", {}), schedule.get("weekdays", {}).get(wd, {}),
              {**schedule.get("dates", {}).get(day.isoformat(), {}), **(extra or {})}]
    plan: dict = {}
    for layer in layers:
        plan.update({k: v for k, v in layer.items() if not k.startswith("_")})
    # shape order: the date's own shape > the theme's shape > weekday/default
    date_entry = layers[2]
    if plan.get("theme"):
        if "shape" not in date_entry:
            theme_shape = load_theme(plan["theme"]).shape
            if theme_shape:
                plan["shape"] = theme_shape
        # a theme's own "settings" apply unless the date entry sets them
        raw = json.loads((HERE / "themes" / f"{plan['theme']}.json").read_text(encoding="utf-8"))
        for k, v in raw.get("settings", {}).items():
            if k not in date_entry:
                plan[k] = v
    shape = plan.get("shape", "4x4")
    if isinstance(shape, list):                  # rotate through the list week by week
        shape = shape[day.isocalendar()[1] % len(shape)]
    plan["shape"] = shape
    return plan


# ------------------------------------------------------------------ workers

def _init(data_dir: str) -> None:
    global _lex
    _lex = Lexicon.load(data_dir)


def build_settings(plan: dict, lex: Lexicon) -> Settings:
    lib = load_shapes()
    shape = resolve_shape(plan["shape"], lib)
    overrides = {k: v for k, v in plan.items() if k in TUNABLE}
    s = settings_for(shape, lex, **overrides)
    if plan.get("theme"):
        s = replace(s, theme=load_theme(plan["theme"]))
    return s


def _make(job):
    day, plan, salt, out = job
    t = time.time()
    try:
        board = daily_board(day, _lex, build_settings(plan, _lex), salt)
    except (RuntimeError, ValueError) as e:
        return day.isoformat(), plan, None, time.time() - t, str(e)
    info = {"main": len(board.main), "bonus": len(board.bonus),
            "theme": (board.theme or {}).get("words", []), "relaxed": board.relaxed}
    if out:
        save_board(board, out)
    else:                                   # a dry run: show the board instead
        info["grid"] = format_grid(board)
    return board.date, plan, info, time.time() - t, ""


# ------------------------------------------------------------------ CLI

def show_shapes() -> None:
    for name, d in load_shapes().items():
        sh = Shape(tuple(d["mask"]), name)
        print(f"{name}  ({d.get('title', '')}, {sh.n_cells} cells)")
        for row in sh.mask:
            print("   " + " ".join("■" if ch == "X" else "·" for ch in row))
        print()


def save_special_day(day: date, entry: dict) -> None:
    path = HERE / "schedule.json"
    sched = load_schedule()
    sched.setdefault("dates", {})[day.isoformat()] = entry
    path.write_text(json.dumps(sched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--start", type=date.fromisoformat, default=date.today())
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--date", type=date.fromisoformat,
                   help="generate just this day (always overwrites) and record it in schedule.json")
    p.add_argument("--no-save", action="store_true",
                   help="with --date: just print the board (no board file, nothing in schedule.json)")
    p.add_argument("--shape", help="shape name from shapes.json, 'NxN', or a mask like '.X./XXX/.X.'")
    p.add_argument("--size", type=int, help="shortcut for --shape NxN")
    p.add_argument("--theme", help="theme file name from themes/ (without .json)")
    p.add_argument("--out", default=str(HERE / "boards" / "daily"))
    p.add_argument("--data", default=str(HERE / "data"))
    p.add_argument("--salt", default="hebrew-word-grid",
                   help="change to get a completely different sequence of boards")
    p.add_argument("--workers", type=int, default=None)
    p.add_argument("--force", action="store_true", help="overwrite existing days")
    p.add_argument("--show", type=date.fromisoformat, help="print a stored board and exit")
    p.add_argument("--shapes", action="store_true", help="show the shape library and exit")
    p.add_argument("--presets", action="store_true", help="list the square presets and exit")
    g = p.add_argument_group("settings (default: measured for the shape / the square preset)")
    for name in TUNABLE:
        kind = float if name in ("main_zipf", "max_bonus_ratio") else int
        g.add_argument("--" + name.replace("_", "-"), type=kind, default=None, help=HELP.get(name))
    a = p.parse_args()
    if a.no_save and not a.date:
        p.error("--no-save only works with --date")
    out = Path(a.out)

    if a.shapes:
        show_shapes()
        return
    if a.presets:
        cols = ["min_main", "max_main", "min_longest", "max_longest", "long_len",
                "min_long_words", "max_long_words", "max_same_letter", "min_distinct"]
        print("size " + "  ".join(f"{c:>15}" for c in cols))
        for size, s in sorted(PRESETS.items()):
            print(f"{size}x{size:<2}" + "  ".join(f"{getattr(s, c):>15}" for c in cols))
        return
    if a.show:
        d = json.loads((out / f"{a.show.isoformat()}.json").read_text(encoding="utf-8"))
        b = Board.from_json(d)
        title = f"{b.shape.name or 'board'}" + (f" · theme: {b.theme['title']}" if b.theme else "")
        print(title + "\n")
        print(format_grid(b))
        if b.theme:
            print(f"\nTHEME WORDS ({len(b.theme['words'])}): {' '.join(b.theme['words'])}")
        print(f"\nMAIN ({len(b.main)}): {' '.join(d['main'])}")
        print(f"\nBONUS ({len(b.bonus)}): {' '.join(d['bonus'])}")
        return

    # one-off overrides that apply to every day of this run
    forced: dict = {}
    if a.size:
        forced["shape"] = f"{a.size}x{a.size}"
    if a.shape:
        lib = load_shapes()
        forced["shape"] = a.shape if a.shape in lib or "x" in a.shape and "/" not in a.shape \
            else resolve_shape(a.shape, lib).key
        resolve_shape(forced["shape"], lib)          # fail early on a bad shape
    if a.theme:
        load_theme(a.theme)
        forced["theme"] = a.theme
    forced.update({n: getattr(a, n) for n in TUNABLE if getattr(a, n) is not None})

    if a.date:
        start, days, force = a.date, 1, True
        if forced and not a.no_save:
            save_special_day(a.date, forced)
            print(f"recorded {a.date} in schedule.json: {forced}")
    else:
        start, days, force = a.start, a.days, a.force

    schedule = load_schedule()
    if a.date and forced:
        # the day's entry becomes exactly the flags, saved or not, so a
        # --no-save try gives the board that saving would
        schedule.setdefault("dates", {})[a.date.isoformat()] = forced
        forced = {}
    if not a.no_save:
        out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for i in range(days):
        day = start + timedelta(days=i)
        path = out / f"{day.isoformat()}.json"
        if force or not path.exists():
            plan = plan_for(day, schedule, forced)
            jobs.append((day, plan, a.salt, None if a.no_save else path))
    print(f"{len(jobs)} board(s) to generate -> {'(dry run, not saved)' if a.no_save else out}")
    if not jobs:
        return

    t0 = time.time()
    mains, failed = [], []
    with Pool(a.workers, initializer=_init, initargs=(a.data,)) as pool:
        for d, plan, info, secs, err in pool.imap(_make, jobs):
            label = plan["shape"] if "/" not in plan["shape"] else "custom"
            if plan.get("theme"):
                label += f" + {plan['theme']}"
            if err:
                failed.append(d)
                print(f"  {d}: FAILED {label} ({secs:.1f}s) {err}")
                continue
            mains.append(info["main"])
            extra = f", theme words: {' '.join(info['theme'])}" if info["theme"] else ""
            relaxed = f", loosened: {'; '.join(info['relaxed'])}" if info["relaxed"] else ""
            print(f"  {d}: {label:10} {info['main']} main, {info['bonus']} bonus "
                  f"({secs:.1f}s){extra}{relaxed}")
            if "grid" in info:
                print("\n" + info["grid"] + "\n")

    if mains:
        print(f"\nmain words per board: min {min(mains)}, median {statistics.median(mains):g}, "
              f"max {max(mains)}  |  {len(mains)} boards in {time.time() - t0:.0f}s")
    if failed:
        print(f"{len(failed)} day(s) failed: loosen the settings and rerun (existing days are kept)")


if __name__ == "__main__":
    main()
