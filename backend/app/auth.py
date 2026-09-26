"""Optional login: Google, or a link sent by email. Logged in, a player's progress
is kept under their account instead of the browser's anonymous id, so it follows
them to every device.

  GET    /api/auth/me                   {providers: {google, email}, user: {name, email} | null}
  GET    /api/auth/google/start         redirect to Google
  GET    /api/auth/google/callback      back from Google: session cookie, redirect to /?login=...
  POST   /api/auth/email/start          {email} -> sends a login link (to /#login=<token>)
  POST   /api/auth/email/verify         {token} -> session cookie, the user
  POST   /api/auth/claim                moves the X-Player-Id's progress into the account
  POST   /api/auth/logout
  DELETE /api/auth/me                   deletes the account and its progress

The session is an opaque token in an HttpOnly, SameSite=Lax cookie; the server
keeps only its hash. Writes must be JSON (see main.py), so a form on another
site can't post here.
"""

from __future__ import annotations

import logging
import re
import secrets
import smtplib
import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import config, google, mailer
from .accounts import EMAIL_TOKEN_TTL, SESSION_DAYS
from .boards import BoardNotFound, get_day
from .deps import SESSION_COOKIE, accounts, anon_player, current_user, player_key, repo, require_user

log = logging.getLogger("ribuon.auth")
router = APIRouter(prefix="/api/auth")

LOGIN_COOKIE = "ribuon_login"               # the Google login's state, between redirect and callback
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LINKS_PER_ADDRESS = 3                       # per EMAIL_TOKEN_TTL
LINKS_PER_IP = 10                           # per hour


class RateLimit:
    """At most `limit` hits per key in a sliding `window` seconds. In memory, which
    is right for the single worker the API runs as."""

    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


ip_limit = RateLimit(LINKS_PER_IP, 3600)


def _set_session(res: Response, user_id: int) -> None:
    res.set_cookie(SESSION_COOKIE, accounts().create_session(user_id), max_age=SESSION_DAYS * 86400,
                   path="/api", httponly=True, secure=config.COOKIE_SECURE, samesite="lax")


def _clear_session(res: Response) -> None:
    res.delete_cookie(SESSION_COOKIE, path="/api", httponly=True, secure=config.COOKIE_SECURE, samesite="lax")


def _public(user: dict | None) -> dict | None:
    return {"name": user["name"], "email": user["email"]} if user else None


@router.get("/me")
def me(response: Response, user: dict | None = Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return {"providers": {"google": google.enabled(), "email": config.EMAIL_LOGIN}, "user": _public(user)}


# --- Google ------------------------------------------------------------------

@router.get("/google/start")
def google_start():
    if not google.enabled():
        raise HTTPException(404, "Google login is off")
    state, verifier, nonce = google.new_login()
    accounts().save_login_state(state, verifier, nonce)
    res = RedirectResponse(google.auth_url(state, verifier, nonce), status_code=302)
    # binds the login to this browser: a callback URL someone else started won't match it
    res.set_cookie(LOGIN_COOKIE, state, max_age=600, path="/api/auth/google",
                   httponly=True, secure=config.COOKIE_SECURE, samesite="lax")
    return res


@router.get("/google/callback")
async def google_callback(state: str = "", code: str = "", error: str = "",
                          ribuon_login: str | None = Cookie(default=None)):
    def back(outcome: str) -> RedirectResponse:
        res = RedirectResponse(f"/?login={outcome}", status_code=302)
        res.delete_cookie(LOGIN_COOKIE, path="/api/auth/google")
        return res

    if not google.enabled():
        raise HTTPException(404, "Google login is off")
    if error:                                   # the player backed out on Google's page
        return back("cancelled")
    if not (state and code and ribuon_login and secrets.compare_digest(state, ribuon_login)):
        return back("failed")
    pending = accounts().take_login_state(state)
    if pending is None:
        return back("failed")
    try:
        claims = await google.exchange(code, *pending)
    except google.GoogleError as e:
        log.warning("google login failed: %s", e)
        return back("failed")
    verified = claims.get("email_verified") in (True, "true")
    user = accounts().login("google", str(claims["sub"]), claims.get("email") if verified else None,
                            str(claims.get("name") or "")[:80])
    res = back("google")
    _set_session(res, user["id"])
    return res


# --- email -------------------------------------------------------------------

class EmailIn(BaseModel):
    email: str = Field(max_length=254)


class TokenIn(BaseModel):
    token: str = Field(max_length=128)


@router.post("/email/start")
def email_start(body: EmailIn, request: Request):
    """Sends a login link. It logs in whoever opens it, making the account on first
    use, so the answer is the same for every address: nothing tells whether one
    already has an account."""
    if not config.EMAIL_LOGIN:
        raise HTTPException(404, "Email login is off")
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "bad_email")
    accs = accounts()
    if accs.email_tokens_since(email, accs.now() - EMAIL_TOKEN_TTL) >= LINKS_PER_ADDRESS:
        raise HTTPException(429, "too_many")
    if not ip_limit.hit(request.client.host if request.client else "?"):
        raise HTTPException(429, "too_many")
    try:
        mailer.send_login_link(email, accs.create_email_token(email))
    except (smtplib.SMTPException, OSError) as e:
        log.error("could not send login email: %s", e)
        raise HTTPException(502, "send_failed")
    return {"ok": True}


@router.post("/email/verify")
def email_verify(body: TokenIn, response: Response):
    email = accounts().use_email_token(body.token)
    if email is None:
        raise HTTPException(400, "expired")
    user = accounts().login("email", email, email)
    _set_session(response, user["id"])
    return {"user": _public(user)}


# --- the account -------------------------------------------------------------

@router.post("/claim")
def claim(user: dict = Depends(require_user), anon: str = Depends(anon_player)):
    """Moves what this browser played before logging in into the account: per day
    the union of both, re-checked against the board. Repeating it is harmless."""
    def merge(date: str, src: dict, dst: dict | None) -> dict:
        words = [f["w"] for f in (dst or {"found": []})["found"]] + [f["w"] for f in src["found"]]
        try:
            found = get_day(date).classify(words)
        except BoardNotFound:                   # a day no longer served: keep both as they were
            found = list({f["w"]: f for f in [*(dst or {"found": []})["found"], *src["found"]]}.values())
        return {"found": found, "rot": dst["rot"] if dst else src["rot"]}

    return {"moved": repo().move(anon, player_key(user), merge)}


@router.post("/logout")
def logout(response: Response, ribuon_session: str | None = Cookie(default=None)):
    if ribuon_session:
        accounts().delete_session(ribuon_session)
    _clear_session(response)
    return {"ok": True}


@router.delete("/me")
def delete_account(response: Response, user: dict = Depends(require_user)):
    repo().delete_player(player_key(user))
    accounts().delete_user(user["id"])
    _clear_session(response)
    return {"ok": True}
