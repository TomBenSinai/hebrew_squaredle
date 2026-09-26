"""Sign in with Google: OpenID Connect authorization code flow with PKCE.

The ID token comes straight from Google's token endpoint over TLS, in exchange
for a one-time code and our client secret, so its signature needn't be checked
(OpenID Connect Core 3.1.3.7, step 6); its issuer, audience, expiry and nonce are.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import httpx

from . import config

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = {"https://accounts.google.com", "accounts.google.com"}


class GoogleError(Exception):
    pass


def enabled() -> bool:
    return bool(config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET)


def redirect_uri() -> str:
    return config.PUBLIC_URL + "/api/auth/google/callback"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def new_login() -> tuple[str, str, str]:
    """A fresh (state, PKCE verifier, nonce)."""
    return secrets.token_urlsafe(32), secrets.token_urlsafe(48), secrets.token_urlsafe(24)


def auth_url(state: str, verifier: str, nonce: str) -> str:
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    return AUTH_URL + "?" + urlencode({
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    })


async def exchange(code: str, verifier: str, nonce: str) -> dict:
    """Trade the code for the ID token and return its checked claims."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(TOKEN_URL, data={
                "code": code,
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            })
    except httpx.HTTPError as e:
        raise GoogleError(f"token endpoint unreachable: {e}") from e
    if res.status_code != 200:
        raise GoogleError(f"token endpoint said {res.status_code}")
    id_token = res.json().get("id_token")
    if not isinstance(id_token, str):
        raise GoogleError("no id_token")
    return check_claims(id_token, nonce)


def check_claims(id_token: str, nonce: str, now: float | None = None) -> dict:
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError) as e:
        raise GoogleError("malformed id_token") from e
    now = time.time() if now is None else now
    if claims.get("iss") not in ISSUERS:
        raise GoogleError("wrong issuer")
    if claims.get("aud") != config.GOOGLE_CLIENT_ID:
        raise GoogleError("wrong audience")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < now - 60:
        raise GoogleError("expired")
    if not claims.get("sub") or not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise GoogleError("bad nonce")
    return claims
