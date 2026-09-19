from __future__ import annotations

import re
from functools import lru_cache

from fastapi import Header, HTTPException

from . import config
from .boards import BoardNotFound, Day, get_day
from .progress import ProgressRepo

_PLAYER_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


@lru_cache(maxsize=1)
def repo() -> ProgressRepo:
    return ProgressRepo(config.DB_PATH)


def day(date: str) -> Day:
    try:
        return get_day(date)
    except BoardNotFound:
        raise HTTPException(404, "No board for this date")


def current_player(x_player_id: str | None = Header(default=None)) -> str:
    """The player the request is for. For now an anonymous id made by the browser;
    replace this with the logged-in user once there is login."""
    if not x_player_id or not _PLAYER_ID.match(x_player_id):
        raise HTTPException(401, "Missing or bad X-Player-Id")
    return x_player_id
