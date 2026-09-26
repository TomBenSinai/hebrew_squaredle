"""Accounts, sessions and the short-lived state of a login in progress (SQLite).

Secrets are never stored as they are: session tokens and email login tokens
are kept as their SHA-256, so a copy of the database can't be used to log in.
Times are Unix seconds.

A user is one person, found by a verified email. Each way they log in is an
identity (google + Google's subject id, or email + the address), so logging in
with Google on one device and with an email link on another, same address,
lands in the same account.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

SESSION_DAYS = 180
# a used session's expiry moves forward at most once a day, not on every request
SESSION_REFRESH = 24 * 3600
LOGIN_STATE_TTL = 10 * 60
EMAIL_TOKEN_TTL = 15 * 60

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    email       TEXT UNIQUE,                 -- lowercase; NULL when not verified
    name        TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
    provider    TEXT NOT NULL,               -- 'google' | 'email'
    subject     TEXT NOT NULL,               -- Google's sub | the address
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_states (    -- a Google login between redirect and callback
    state_hash  TEXT PRIMARY KEY,
    verifier    TEXT NOT NULL,               -- PKCE code_verifier
    nonce       TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash  TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_tokens_email ON email_tokens(email, created_at);
"""


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _user(row: sqlite3.Row | None) -> dict | None:
    return {"id": row["id"], "email": row["email"], "name": row["name"]} if row else None


class AccountRepo:
    def __init__(self, path: Path, clock=time.time):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, timeout=10)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA foreign_keys = ON")
        self._lock = threading.Lock()
        self._clock = clock
        with self._tx() as db:
            db.executescript(SCHEMA)

    def now(self) -> int:
        return int(self._clock())

    @contextmanager
    def _tx(self):
        with self._lock, self._db:
            yield self._db

    # --- users ---------------------------------------------------------------

    def get_user(self, user_id: int) -> dict | None:
        with self._tx() as db:
            return _user(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    def login(self, provider: str, subject: str, email: str | None, name: str = "") -> dict:
        """The user behind this identity, made on first login. A verified `email`
        (pass None when the provider didn't verify it) joins an existing user
        with that address, whichever way they logged in before."""
        email = email.lower() if email else None
        with self._tx() as db:
            row = db.execute("SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id "
                             "WHERE i.provider = ? AND i.subject = ?", (provider, subject)).fetchone()
            if row is None and email:
                row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if row is None:
                uid = db.execute("INSERT INTO users (email, name, created_at) VALUES (?, ?, ?)",
                                 (email, name, self.now())).lastrowid
                row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            db.execute("INSERT OR IGNORE INTO identities (provider, subject, user_id) VALUES (?, ?, ?)",
                       (provider, subject, row["id"]))
            if name and not row["name"]:
                db.execute("UPDATE users SET name = ? WHERE id = ?", (name, row["id"]))
            return self._fresh_user(db, row["id"])

    @staticmethod
    def _fresh_user(db: sqlite3.Connection, user_id: int) -> dict:
        return _user(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    def delete_user(self, user_id: int) -> None:
        """The user, their identities and sessions (progress is ProgressRepo's)."""
        with self._tx() as db:
            db.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # --- sessions ------------------------------------------------------------

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        now = self.now()
        with self._tx() as db:
            db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            db.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                       (_hash(token), user_id, now, now + SESSION_DAYS * 86400))
        return token

    def session_user(self, token: str) -> dict | None:
        """The user this session token belongs to, or None when unknown or expired.
        A session in use stays alive: each day it's used pushes its expiry on."""
        now = self.now()
        h = _hash(token)
        with self._tx() as db:
            row = db.execute("SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id "
                             "WHERE s.token_hash = ?", (h,)).fetchone()
            if row is None or row["expires_at"] <= now:
                return None
            new_expiry = now + SESSION_DAYS * 86400
            if new_expiry - row["expires_at"] >= SESSION_REFRESH:
                db.execute("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", (new_expiry, h))
            return _user(row)

    def delete_session(self, token: str) -> None:
        with self._tx() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(token),))

    # --- Google login in progress -------------------------------------------

    def save_login_state(self, state: str, verifier: str, nonce: str) -> None:
        now = self.now()
        with self._tx() as db:
            db.execute("DELETE FROM login_states WHERE expires_at < ?", (now,))
            db.execute("INSERT INTO login_states VALUES (?, ?, ?, ?)",
                       (_hash(state), verifier, nonce, now + LOGIN_STATE_TTL))

    def take_login_state(self, state: str) -> tuple[str, str] | None:
        """(verifier, nonce) for this state, once: it's deleted as it's read."""
        with self._tx() as db:
            row = db.execute("DELETE FROM login_states WHERE state_hash = ? RETURNING verifier, nonce, expires_at",
                             (_hash(state),)).fetchone()
        if row is None or row["expires_at"] <= self.now():
            return None
        return row["verifier"], row["nonce"]

    # --- email login links -----------------------------------------------------

    def email_tokens_since(self, email: str, since: int) -> int:
        with self._tx() as db:
            return db.execute("SELECT COUNT(*) FROM email_tokens WHERE email = ? AND created_at >= ?",
                              (email.lower(), since)).fetchone()[0]

    def create_email_token(self, email: str) -> str:
        token = secrets.token_urlsafe(32)
        now = self.now()
        with self._tx() as db:
            # rows stay a day past expiry: they are what the per-address rate limit counts
            db.execute("DELETE FROM email_tokens WHERE expires_at < ?", (now - 86400,))
            db.execute("INSERT INTO email_tokens VALUES (?, ?, ?, ?)",
                       (_hash(token), email.lower(), now, now + EMAIL_TOKEN_TTL))
        return token

    def use_email_token(self, token: str) -> str | None:
        """The address this link was sent to, once and only while fresh. Using it
        spends it (and every other link sent to the same address)."""
        now = self.now()
        with self._tx() as db:
            row = db.execute("SELECT email, expires_at FROM email_tokens WHERE token_hash = ?",
                             (_hash(token),)).fetchone()
            if row is None or row["expires_at"] <= now:
                return None
            # expire rather than delete, so the rate limit still counts them
            db.execute("UPDATE email_tokens SET expires_at = ? WHERE email = ? AND expires_at > ?",
                       (now, row["email"], now))
            return row["email"]
