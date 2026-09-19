#!/usr/bin/env python3
"""
Classify every Hspell word form by its grammar, using Hspell's own morphology
(`hspell -l`, built with --enable-linginfo). Writes data/morph.tsv:

    word <TAB> kind <TAB> lemmas (comma-separated, used to block every form of a word)

kind is one of:
  base        a dictionary headword: one reading is the lemma itself (a noun in the
              singular, an adjective in the masculine singular, a verb in the past
              3rd person masculine singular). e.g. נעול, פתיר, שמר
  plain       an ordinary inflected form (plural, feminine, verb conjugation...),
              e.g. ספרים, מורכבת, למדו
  bound       every reading is a construct form (סמיכות, e.g. גינת) or carries a
              possessive suffix (כינוי חבור, e.g. לועי, ספריו). Goes to BONUS.
  infinitive  ל + infinitive (שם הפועל, e.g. לתרום), which Hspell stores as a
              prefix + stem. Treated like a headword. With a pronoun suffix
              (לשחררם, להסירו) it counts as bound.
  name        only proper-noun readings (פרטי). Left out.

Needs the compiled hspell binary with its dictionary installed (make; copy
hebrew.wgz* to /usr/local/share/hspell). Run once; build_wordlists.py only
reads the resulting data/morph.tsv, so the rest works without Hspell.

  python analyze_hspell.py --hspell /path/to/hspell-1.4/hspell
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
SRC, DATA = HERE / "sources", HERE / "data"
HEBREW = re.compile(r"^[א-ת]+$")


def read_list(path: Path) -> set[str]:
    return {l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()}


def run_hspell(hspell: str, words: list[str]) -> str:
    text = "\n".join(words) + "\n"
    out = subprocess.run([hspell, "-l"], input=text.encode("iso-8859-8"),
                         capture_output=True, check=False)
    return out.stdout.decode("iso-8859-8")


def parse(output: str) -> dict[str, dict]:
    """word -> {"base", "plain", "bound", "name", "inf"}: bools"""
    info: dict[str, dict] = {}
    cur = None
    prefixed = False
    for line in output.splitlines():
        if not line.strip():
            continue
        if not line.startswith("\t"):
            # header: "מילה חוקית: X" or "צירוף חוקי: pre+rest"
            cur, prefixed = None, False
            if ":" in line:
                label, _, body = line.partition(":")
                body = body.strip()
                prefixed = "+" in body
                cur = body.replace("+", "")
                info.setdefault(cur, {"base": False, "plain": False, "bound": False, "name": False, "inf": False, "lemmas": set()})
                cur_prefix = body.split("+")[0] if prefixed else ""
            continue
        if cur is None:
            continue
        m = re.search(r"\(([^)]*)\)", line)
        tags = m.group(1).split(",") if m else []
        rec = info[cur]
        lemma = line.strip().split("(")[0].strip()
        if prefixed:
            # only "ל + infinitive" counts; other prefix readings are not words for us
            if cur_prefix == "ל" and "מקור" in tags:
                if any(t.startswith("כינוי") for t in tags):
                    rec["bound"] = True          # לשחררם, להסירו: infinitive + suffix
                else:
                    rec["inf"] = True
                rec["lemmas"].add(lemma)
            continue
        rec["lemmas"].add(lemma)
        if "פרטי" in tags:
            rec["name"] = True
        elif any(t == "סמיכות" or t.startswith("כינוי") for t in tags):
            rec["bound"] = True
        else:
            rec["plain"] = True
            if lemma == cur:
                rec["base"] = True
    return info


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--hspell", required=True, help="path to the compiled hspell binary")
    p.add_argument("--min-len", type=int, default=4)
    a = p.parse_args()

    forms = sorted(w for w in read_list(SRC / "all_no_fatverb.txt")
                   if HEBREW.match(w) and len(w) >= a.min_len)
    verbs = read_list(SRC / "verbs_no_fatverb.txt")
    inf_candidates = sorted({"ל" + v for v in verbs if HEBREW.match(v) and len(v) + 1 >= a.min_len})

    info: dict[str, dict] = {}
    batch = 20000
    extra = [w for w in read_list(DATA / "blocklist.txt") if HEBREW.match(w)]
    todo = forms + inf_candidates + extra
    for i in range(0, len(todo), batch):
        part = parse(run_hspell(a.hspell, todo[i:i + batch]))
        for w, r in part.items():
            cur = info.setdefault(w, {"base": False, "plain": False, "bound": False, "name": False, "inf": False, "lemmas": set()})
            for k in cur:
                cur[k] = cur[k] | r[k] if k == "lemmas" else (cur[k] or r[k])
        print(f"  analysed {min(i + batch, len(todo)):,}/{len(todo):,}")

    counts = {"base": 0, "plain": 0, "bound": 0, "infinitive": 0, "name": 0}
    lines = []
    for w in sorted(info):
        r = info[w]
        if len(w) < 3:
            continue
        if r["base"]:
            kind = "base"
        elif r["inf"]:
            kind = "infinitive"
        elif r["plain"]:
            kind = "plain"
        elif r["bound"]:
            kind = "bound"
        elif r["name"]:
            kind = "name"
        else:
            continue
        counts[kind] += 1
        lines.append(f"{w}\t{kind}\t{','.join(sorted(r['lemmas']))}")
    (DATA / "morph.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote data/morph.tsv:", ", ".join(f"{k} {v:,}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
