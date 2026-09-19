#!/usr/bin/env python3
"""
Bundle stored boards into one self-contained page: web/index.html.

  python build_web.py                       # every board in boards/daily (any shape, themes)
  python build_web.py --size 4 --out web/index-4x4.html   # an older boards/4x4 folder
  python build_web.py --from 2026-09-01 --to 2027-03-31

The page shows today's board (Israel time) and lets players go back to
earlier days; future boards stay hidden. It needs no server: open the file
directly or serve it from any static web server. Only the Google Fonts link
needs the internet, and the page falls back to system Hebrew fonts without it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--size", type=int, help="read boards/<size>x<size> instead of boards/daily")
    p.add_argument("--boards", help="folder of board JSON files (default boards/daily)")
    p.add_argument("--from", dest="start", default="0000-00-00")
    p.add_argument("--to", dest="end", default="9999-99-99")
    p.add_argument("--out", default=str(HERE / "web" / "index.html"))
    a = p.parse_args()

    boards = {}
    folder = Path(a.boards) if a.boards else \
        HERE / "boards" / (f"{a.size}x{a.size}" if a.size else "daily")
    shapes = json.loads((HERE / "shapes.json").read_text(encoding="utf-8")) \
        if (HERE / "shapes.json").exists() else {}
    for f in sorted(folder.glob("*.json")):
        if not (a.start <= f.stem <= a.end):
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if "letters" in d:
            letters, mask = d["letters"], d["shape"]["mask"]
            shape_name = d["shape"].get("name", "")
        else:                                        # older square boards
            letters = "".join(ch for row in d["grid"] for ch in row)
            n = int(len(letters) ** 0.5)
            mask, shape_name = ["X" * n] * n, f"{n}x{n}"
        entry = {"g": letters, "s": "/".join(mask),
                 "m": " ".join(d["main"]), "b": " ".join(d["bonus"])}
        title = shapes.get(shape_name, {}).get("title", "")
        if title and not all(set(r) == {"X"} for r in mask):
            entry["n"] = title                       # shape name, shown for special shapes
        if d.get("theme"):
            entry["t"] = d["theme"]["title"]
            entry["tw"] = " ".join(d["theme"]["words"])
        boards[d["date"]] = entry
    if not boards:
        raise SystemExit("No boards found; run generate_days.py first")

    html = (HERE / "web" / "template.html").read_text(encoding="utf-8")
    html = html.replace("/*BOARDS*/{}", json.dumps(boards, ensure_ascii=False, separators=(",", ":")))
    html = html.replace("/*EPOCH*/", min(boards))
    Path(a.out).write_text(html, encoding="utf-8")
    print(f"{len(boards)} boards ({min(boards)} .. {max(boards)}) -> {a.out} "
          f"({Path(a.out).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
