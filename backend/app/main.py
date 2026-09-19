"""ריבועון API.

  GET  /api/days                        playable days (newest last) with totals
  GET  /api/boards/{date}               letters, shape, counts (never the words)
  POST /api/boards/{date}/check         {path: [cells]} -> main / bonus / not_a_word ...
  POST /api/boards/{date}/live-cells    {found: [words]} -> cells some unfound main word still uses
  GET  /api/progress                    this player's progress on every day
  GET  /api/progress/{date}
  PUT  /api/progress/{date}             {found, rot}; merged with what's stored, words re-checked
  GET  /api/define/{word}               short definition from Milog
"""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, milog
from .boards import Day, all_dates, load_day, playable_dates
from .deps import current_player, day, repo

app = FastAPI(title="Rivuon API")
if config.CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                       allow_methods=["*"], allow_headers=["*"])


class CheckIn(BaseModel):
    path: list[int] = Field(max_length=64)


class FoundIn(BaseModel):
    found: list[str] = Field(default_factory=list, max_length=5000)


class FoundWord(BaseModel):
    w: str
    cat: str
    theme: bool = False


class ProgressIn(BaseModel):
    found: list[FoundWord] = Field(default_factory=list, max_length=5000)
    rot: int = Field(default=0, ge=0, le=3)


@app.get("/api/health")
def health():
    return {"ok": True, "today": config.today(), "boards": len(all_dates())}


@app.get("/api/days")
def days():
    dates = playable_dates()          # one scan of boards/daily for the whole list
    return {"today": config.today(), "days": [load_day(d).summary(dates[0]) for d in dates]}


@app.get("/api/boards/{date}")
def board(d: Day = Depends(day)):
    return d.public()


@app.post("/api/boards/{date}/check")
def check(body: CheckIn, d: Day = Depends(day)):
    return d.check_path(body.path)


@app.post("/api/boards/{date}/live-cells")
def live_cells(body: FoundIn, d: Day = Depends(day)):
    return {"cells": d.live_cells(body.found)}


@app.get("/api/progress")
def progress_all(player: str = Depends(current_player)):
    return repo().all(player)


@app.get("/api/progress/{date}")
def progress_get(d: Day = Depends(day), player: str = Depends(current_player)):
    return repo().get(player, d.date) or {"found": [], "rot": 0}


@app.put("/api/progress/{date}")
def progress_put(body: ProgressIn, d: Day = Depends(day), player: str = Depends(current_player)):
    """Union of stored and sent words (a word once found stays found), re-checked
    against the board so only real words are kept."""
    def merge(stored: dict | None) -> dict:
        words = [f["w"] for f in (stored or {"found": []})["found"]] + [f.w for f in body.found]
        return {"found": d.classify(words), "rot": body.rot}

    return repo().update(player, d.date, merge)


@app.get("/api/define/{word}")
async def define(word: str):
    return await milog.define(word.strip()[:40])
