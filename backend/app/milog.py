"""Definitions from Milog (milog.co.il).

Milog sends no CORS headers, so the browser can't read it directly; the
backend fetches the search page and pulls out the entries. The page is
plain server-rendered HTML:

  div.sr_e                      one entry
    a.sr_e_t  "יוֹרְדִים - <span>יוֹרֵד, שם עצם, הטייה: רבים</span>"
    div.sr_e_para > div.sr_e_txt  "definition <span.sr_example>"…"</span>"
"""

from __future__ import annotations

import time
from collections import OrderedDict
from html.parser import HTMLParser
from urllib.parse import quote

import httpx

MILOG = "https://milog.co.il/"
MAX_ENTRIES = 3
MAX_SENSES = 3
CACHE_TTL = 7 * 24 * 3600
CACHE_SIZE = 5000                         # the endpoint takes any string, so keep this bounded

_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()   # least recently used first


def url_for(word: str) -> str:
    return MILOG + quote(word)


class _Parser(HTMLParser):
    """Collects entries: {title, info, senses: [{text, examples}]}."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries: list[dict] = []
        self._stack: list[str] = []       # role of each open tag we care about ("" otherwise)

    def _role(self, tag, attrs) -> str:
        cls = dict(attrs).get("class") or ""
        classes = set(cls.split())
        if tag == "div" and "sr_e" in classes:
            return "entry"
        if tag == "a" and "sr_e_t" in classes:
            return "title"
        if tag == "span" and self._inside("title"):
            return "info"
        if tag == "div" and "sr_e_txt" in classes:
            return "sense"
        if tag == "span" and "sr_example" in classes:
            return "example"
        return ""

    def _inside(self, role: str) -> bool:
        return role in self._stack

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "img", "input", "meta", "link", "hr"):
            return
        role = self._role(tag, attrs)
        if role == "entry":
            self.entries.append({"title": "", "info": "", "senses": []})
        elif role == "sense" and self.entries:
            self.entries[-1]["senses"].append({"text": "", "examples": []})
        elif role == "example" and self.entries and self.entries[-1]["senses"]:
            self.entries[-1]["senses"][-1]["examples"].append("")
        self._stack.append(role)

    def handle_endtag(self, tag):
        if tag in ("br", "img", "input", "meta", "link", "hr"):
            return
        if self._stack:
            self._stack.pop()

    def handle_data(self, data):
        if not self.entries or not self._inside("entry"):
            return
        e = self.entries[-1]
        if self._inside("info"):
            e["info"] += data
        elif self._inside("title"):
            e["title"] += data
        elif self._inside("example") and e["senses"]:
            e["senses"][-1]["examples"][-1] += data
        elif self._inside("sense") and e["senses"]:
            e["senses"][-1]["text"] += data


def _clean(text: str) -> str:
    return " ".join(text.replace("⁻", "-").split()).strip()


def parse(html: str) -> list[dict]:
    p = _Parser()
    p.feed(html)
    out = []
    for e in p.entries:
        senses = [{"text": _clean(s["text"]),
                   "examples": [_clean(x).strip('"') for x in s["examples"] if _clean(x)]}
                  for s in e["senses"]]
        # some forms (e.g. כיפורים) have only example sentences, no definition line
        senses = [s for s in senses if s["text"] or s["examples"]]
        if not senses:
            continue
        out.append({"title": _clean(e["title"]).rstrip(" -"), "info": _clean(e["info"]),
                    "senses": senses[:MAX_SENSES]})
    # entries with a definition first
    out.sort(key=lambda e: not any(s["text"] for s in e["senses"]))
    return out[:MAX_ENTRIES]


async def define(word: str) -> dict:
    """{word, url, entries}; entries is empty when Milog has nothing (or is down)."""
    now = time.time()
    hit = _cache.get(word)
    if hit and now - hit[0] < CACHE_TTL:
        _cache.move_to_end(word)
        return hit[1]
    result = {"word": word, "url": url_for(word), "entries": []}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 (rivuon word game)"}) as client:
            r = await client.get(result["url"])
            r.raise_for_status()
        result["entries"] = parse(r.text)
    except httpx.HTTPError:
        return result                     # not cached: try again next time
    _cache[word] = (now, result)
    _cache.move_to_end(word)
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return result
