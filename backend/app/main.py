"""ריבועון API.

  GET  /api/days                        playable days (newest last) with totals
  GET  /api/boards/{date}               letters, shape, counts, and the words hashed (never in the clear)
  POST /api/boards/{date}/check         {path: [cells]} -> main / bonus / not_a_word ... (for clients
                                        that can't check locally)
  POST /api/boards/{date}/live-cells    {found: [words]} -> cells some unfound main word still uses,
                                        and, once unlocked by progress, per cell how many
                                        unfound main words start at / use it, plus the
                                        part-spelled words still missing
  GET  /api/progress                    this player's progress on every day
  GET  /api/progress/{date}
  PUT  /api/progress/{date}             {found, rot}; merged with what's stored, words re-checked
  GET  /api/define/{word}               short definition from Milog
  /api/auth/...                         optional login (auth.py)

Progress is the logged-in user's when the request carries a session cookie,
else the anonymous X-Player-Id's.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import auth, config, milog
from .boards import Day, all_dates, load_day, playable_dates
from .deps import current_player, day, repo

app = FastAPI(title="Ribuon API")
if config.CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                       allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def json_writes_only(request: Request, call_next):
    """Every write must be JSON. A page on another site can only send JSON after a
    CORS preflight, which it won't pass, so it can't use a player's session cookie
    to change their progress or account (on top of SameSite=Lax)."""
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if request.method in UNSAFE and ctype != "application/json":
        return JSONResponse({"detail": "Send JSON"}, status_code=415)
    return await call_next(request)


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
    return d.live_cells(body.found)


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
