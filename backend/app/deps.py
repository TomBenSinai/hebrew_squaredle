from __future__ import annotations

import re
from functools import lru_cache

from fastapi import Cookie, Depends, Header, HTTPException

from . import config
from .accounts import AccountRepo
from .boards import BoardNotFound, Day, get_day
from .progress import ProgressRepo

_PLAYER_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
SESSION_COOKIE = "ribuon_session"


@lru_cache(maxsize=1)
def repo() -> ProgressRepo:
    return ProgressRepo(config.DB_PATH)


@lru_cache(maxsize=1)
def accounts() -> AccountRepo:
    return AccountRepo(config.DB_PATH)


def day(date: str) -> Day:
    try:
        return get_day(date)
    except BoardNotFound:
        raise HTTPException(404, "No board for this date")


def current_user(ribuon_session: str | None = Cookie(default=None)) -> dict | None:
    """The logged-in user, or None (no session, or an expired or revoked one)."""
    return accounts().session_user(ribuon_session) if ribuon_session else None


def require_user(user: dict | None = Depends(current_user)) -> dict:
    if user is None:
        raise HTTPException(401, "Not logged in")
    return user


def anon_player(x_player_id: str | None = Header(default=None)) -> str:
    """The anonymous id the browser made up for itself."""
    if not x_player_id or not _PLAYER_ID.match(x_player_id):
        raise HTTPException(401, "Missing or bad X-Player-Id")
    return x_player_id


def player_key(user: dict) -> str:
    # ':' can't occur in an anonymous id, so the two never collide
    return f"user:{user['id']}"


def current_player(user: dict | None = Depends(current_user),
                   x_player_id: str | None = Header(default=None)) -> str:
    """Whose progress the request is about: the logged-in user's, else the browser's
    anonymous id."""
    return player_key(user) if user else anon_player(x_player_id)
