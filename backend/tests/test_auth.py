"""Login and progress moving with it. From backend/, with the repo root on the path:

    python -m unittest discover -s tests -v
    docker compose exec backend python -m unittest discover -s tests -v
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

# config is read on import: set it up first
os.environ.update({
    "RIBUON_TODAY": "2026-09-10",
    "RIBUON_PUBLIC_URL": "http://testserver",
    "RIBUON_GOOGLE_CLIENT_ID": "client-123",
    "RIBUON_GOOGLE_CLIENT_SECRET": "secret",
    "RIBUON_MAIL_TO_LOG": "1",
})

import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import auth, config, deps, google, mailer  # noqa: E402
from app.accounts import AccountRepo  # noqa: E402
from app.boards import get_day  # noqa: E402
from app.main import app  # noqa: E402

DATE = "2026-09-03"
OTHER = "2026-09-04"
ANON_A = "anon-aaaa-1111"
ANON_B = "anon-bbbb-2222"


def words(date: str, n: int, skip: int = 0) -> list[str]:
    return list(get_day(date).board.main)[skip:skip + n]


def found(ws: list[str]) -> list[dict]:
    return [{"w": w, "cat": "main"} for w in ws]


def id_token(**claims) -> str:
    part = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'RS256'})}.{part(claims)}.sig"


class Base(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        patcher = mock.patch.object(config, "DB_PATH", Path(tmp.name) / "t.db")
        patcher.start()
        self.addCleanup(patcher.stop)
        deps.repo.cache_clear()
        deps.accounts.cache_clear()
        auth.ip_limit.reset()
        self.sent: list[tuple[str, str]] = []
        send = mock.patch.object(mailer, "send_login_link", lambda to, token: self.sent.append((to, token)))
        send.start()
        self.addCleanup(send.stop)

    def client(self) -> TestClient:
        """One browser: its own cookie jar."""
        return TestClient(app)

    # --- steps ---

    def play(self, c: TestClient, anon: str, date: str, ws: list[str]) -> dict:
        r = c.put(f"/api/progress/{date}", json={"found": found(ws), "rot": 1},
                  headers={"X-Player-Id": anon})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def progress(self, c: TestClient, anon: str) -> dict:
        return c.get("/api/progress", headers={"X-Player-Id": anon}).json()

    def email_login(self, c: TestClient, email: str) -> dict:
        self.assertEqual(c.post("/api/auth/email/start", json={"email": email}).status_code, 200)
        r = c.post("/api/auth/email/verify", json={"token": self.sent[-1][1]})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["user"]

    def google_start(self, c: TestClient) -> tuple[str, str]:
        """Start a Google login in browser `c`: (state, nonce) as sent to Google."""
        start = c.get("/api/auth/google/start", follow_redirects=False)
        self.assertEqual(start.status_code, 302)
        q = parse_qs(urlparse(start.headers["location"]).query)
        return q["state"][0], q["nonce"][0]

    def google_callback(self, c: TestClient, state: str, sent_nonce: str, **claims) -> httpx.Response:
        """Google sends browser `c` back; its token endpoint answers with these claims."""
        claims = {"iss": "https://accounts.google.com", "aud": "client-123", "exp": time.time() + 300,
                  "nonce": sent_nonce, "sub": "g-1", "email": "Tom@Example.com",
                  "email_verified": True, "name": "Tom", **claims}

        def token_endpoint(request: httpx.Request) -> httpx.Response:
            body = parse_qs(request.content.decode())
            self.assertGreater(len(body["code_verifier"][0]), 40)
            return httpx.Response(200, json={"id_token": id_token(**claims)})

        real = httpx.AsyncClient
        with mock.patch.object(google.httpx, "AsyncClient",
                               lambda **kw: real(transport=httpx.MockTransport(token_endpoint), **kw)):
            return c.get(f"/api/auth/google/callback?state={state}&code=abc", follow_redirects=False)

    def google_login(self, c: TestClient, **claims) -> httpx.Response:
        return self.google_callback(c, *self.google_start(c), **claims)

    def me(self, c: TestClient) -> dict | None:
        return c.get("/api/auth/me").json()["user"]


class TestSession(Base):
    def test_anonymous_by_default(self):
        c = self.client()
        body = c.get("/api/auth/me").json()
        self.assertIsNone(body["user"])
        self.assertEqual(body["providers"], {"google": True, "email": True})

    def test_email_login_sets_session_cookie(self):
        c = self.client()
        user = self.email_login(c, " Someone@Example.com ")
        self.assertEqual(user["email"], "someone@example.com")
        self.assertEqual(self.me(c)["email"], "someone@example.com")
        cookie = next(x for x in c.cookies.jar if x.name == "ribuon_session")
        self.assertEqual(cookie.path, "/api")
        self.assertTrue(cookie.has_nonstandard_attr("HttpOnly"))

    def test_session_token_is_stored_hashed(self):
        c = self.client()
        self.email_login(c, "a@example.com")
        token = c.cookies["ribuon_session"]
        rows = deps.accounts()._db.execute("SELECT token_hash FROM sessions").fetchall()
        self.assertNotIn(token, [r[0] for r in rows])

    def test_logout_revokes_session(self):
        c = self.client()
        self.email_login(c, "a@example.com")
        token = c.cookies["ribuon_session"]
        c.post("/api/auth/logout", json={})
        self.assertIsNone(self.me(c))
        # the old token is dead on the server too, not just dropped by this browser
        other = self.client()
        other.cookies.set("ribuon_session", token, path="/api")
        self.assertIsNone(self.me(other))

    def test_garbage_session_falls_back_to_anonymous(self):
        c = self.client()
        c.cookies.set("ribuon_session", "nope", path="/api")
        self.assertIsNone(self.me(c))
        self.play(c, ANON_A, DATE, words(DATE, 1))
        self.assertIn(DATE, self.progress(c, ANON_A))

    def test_writes_must_be_json(self):
        c = self.client()
        r = c.post("/api/auth/email/start", content="email=a@example.com",
                   headers={"Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(r.status_code, 415)
        r = c.post("/api/auth/logout", content="", headers={"Content-Type": "text/plain"})
        self.assertEqual(r.status_code, 415)


class TestSessionExpiry(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.now = 1_000_000.0
        self.repo = AccountRepo(Path(tmp.name) / "t.db", clock=lambda: self.now)
        self.user = self.repo.login("email", "a@example.com", "a@example.com")

    def test_session_expires_after_idle_period(self):
        token = self.repo.create_session(self.user["id"])
        self.now += 181 * 86400
        self.assertIsNone(self.repo.session_user(token))

    def test_use_keeps_session_alive(self):
        token = self.repo.create_session(self.user["id"])
        for _ in range(4):
            self.now += 100 * 86400
            self.assertIsNotNone(self.repo.session_user(token))

    def test_email_token_expires(self):
        token = self.repo.create_email_token("a@example.com")
        self.now += 16 * 60
        self.assertIsNone(self.repo.use_email_token(token))

    def test_deleting_user_drops_sessions(self):
        token = self.repo.create_session(self.user["id"])
        self.repo.delete_user(self.user["id"])
        self.assertIsNone(self.repo.session_user(token))


class TestEmailLogin(Base):
    def test_link_works_once(self):
        c = self.client()
        c.post("/api/auth/email/start", json={"email": "a@example.com"})
        token = self.sent[-1][1]
        self.assertEqual(c.post("/api/auth/email/verify", json={"token": token}).status_code, 200)
        self.assertEqual(c.post("/api/auth/email/verify", json={"token": token}).json()["detail"], "expired")

    def test_using_a_link_spends_older_ones(self):
        c = self.client()
        c.post("/api/auth/email/start", json={"email": "a@example.com"})
        c.post("/api/auth/email/start", json={"email": "a@example.com"})
        first, second = self.sent[0][1], self.sent[1][1]
        self.assertEqual(c.post("/api/auth/email/verify", json={"token": second}).status_code, 200)
        self.assertEqual(c.post("/api/auth/email/verify", json={"token": first}).status_code, 400)

    def test_wrong_token(self):
        c = self.client()
        self.assertEqual(c.post("/api/auth/email/verify", json={"token": "x" * 43}).status_code, 400)

    def test_bad_address(self):
        c = self.client()
        self.assertEqual(c.post("/api/auth/email/start", json={"email": "not-an-email"}).status_code, 422)
        self.assertEqual(self.sent, [])

    def test_rate_limit_per_address(self):
        c = self.client()
        codes = [c.post("/api/auth/email/start", json={"email": "a@example.com"}).status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])
        self.assertEqual(len(self.sent), 3)
        # another address is not held up by it
        self.assertEqual(c.post("/api/auth/email/start", json={"email": "b@example.com"}).status_code, 200)

    def test_rate_limit_per_ip(self):
        c = self.client()
        codes = [c.post("/api/auth/email/start", json={"email": f"u{i}@example.com"}).status_code
                 for i in range(auth.LINKS_PER_IP + 1)]
        self.assertEqual(codes[-1], 429)
        self.assertTrue(all(code == 200 for code in codes[:-1]))

    def test_same_answer_for_new_and_known_addresses(self):
        c = self.client()
        self.email_login(c, "known@example.com")
        known = self.client().post("/api/auth/email/start", json={"email": "known@example.com"})
        new = self.client().post("/api/auth/email/start", json={"email": "new@example.com"})
        self.assertEqual((known.status_code, known.json()), (new.status_code, new.json()))

    def test_off_without_smtp(self):
        with mock.patch.object(config, "EMAIL_LOGIN", False):
            c = self.client()
            self.assertEqual(c.post("/api/auth/email/start", json={"email": "a@example.com"}).status_code, 404)
            self.assertFalse(c.get("/api/auth/me").json()["providers"]["email"])


class TestGoogleLogin(Base):
    def test_login(self):
        c = self.client()
        r = self.google_login(c)
        self.assertEqual(r.headers["location"], "/?login=google")
        self.assertEqual(self.me(c), {"name": "Tom", "email": "tom@example.com"})

    def test_same_verified_email_is_the_same_account(self):
        phone, laptop = self.client(), self.client()
        self.email_login(phone, "tom@example.com")
        self.play(phone, ANON_A, DATE, words(DATE, 2))
        self.google_login(laptop)
        self.assertEqual(set(self.progress(laptop, ANON_B)), {DATE})

    def test_unverified_email_does_not_join_an_account(self):
        phone, laptop = self.client(), self.client()
        self.email_login(phone, "tom@example.com")
        self.play(phone, ANON_A, DATE, words(DATE, 2))
        self.google_login(laptop, email_verified=False)
        self.assertEqual(self.progress(laptop, ANON_B), {})

    def test_state_must_match_this_browsers_cookie(self):
        # login CSRF: the attacker starts a login and gets the victim to finish it
        attacker, victim = self.client(), self.client()
        r = self.google_callback(victim, *self.google_start(attacker))
        self.assertEqual(r.headers["location"], "/?login=failed")
        self.assertIsNone(self.me(victim))

    def test_state_is_single_use(self):
        c = self.client()
        state, nonce = self.google_start(c)
        self.assertEqual(self.google_callback(c, state, nonce).headers["location"], "/?login=google")
        c.post("/api/auth/logout", json={})
        r = self.google_callback(c, state, nonce)
        self.assertEqual(r.headers["location"], "/?login=failed")

    def test_cancelled_on_google(self):
        c = self.client()
        self.google_start(c)
        r = c.get("/api/auth/google/callback?error=access_denied", follow_redirects=False)
        self.assertEqual(r.headers["location"], "/?login=cancelled")

    def test_bad_claims(self):
        for bad in ({"aud": "someone-else"}, {"iss": "https://evil.example"}, {"exp": time.time() - 3600},
                    {"nonce": "replayed"}):
            with self.subTest(bad=bad):
                c = self.client()
                self.assertEqual(self.google_login(c, **bad).headers["location"], "/?login=failed")
                self.assertIsNone(self.me(c))

    def test_off_without_client(self):
        with mock.patch.object(config, "GOOGLE_CLIENT_ID", ""):
            c = self.client()
            self.assertEqual(c.get("/api/auth/google/start", follow_redirects=False).status_code, 404)
            self.assertFalse(c.get("/api/auth/me").json()["providers"]["google"])


class TestProgressFollowsTheAccount(Base):
    def claim(self, c: TestClient, anon: str) -> httpx.Response:
        return c.post("/api/auth/claim", json={}, headers={"X-Player-Id": anon})

    def test_claim_moves_anonymous_progress(self):
        c = self.client()
        self.play(c, ANON_A, DATE, words(DATE, 3))
        self.email_login(c, "a@example.com")
        self.assertEqual(self.claim(c, ANON_A).json()["moved"], [DATE])
        mine = self.progress(c, ANON_A)
        self.assertEqual([f["w"] for f in mine[DATE]["found"]], words(DATE, 3))
        # the anonymous id's own rows are gone: logging out doesn't leave a copy behind
        self.assertEqual(self.progress(self.client(), ANON_A), {})

    def test_two_devices_merge(self):
        phone, laptop = self.client(), self.client()
        self.play(phone, ANON_A, DATE, words(DATE, 2))
        self.play(laptop, ANON_B, DATE, words(DATE, 2, skip=1))     # one word in common
        self.play(laptop, ANON_B, OTHER, words(OTHER, 1))
        for c, anon in ((phone, ANON_A), (laptop, ANON_B)):
            self.email_login(c, "a@example.com")
            self.claim(c, anon)
        for c in (phone, laptop):
            p = self.progress(c, "ignored-id")
            self.assertEqual([f["w"] for f in p[DATE]["found"]], words(DATE, 3))
            self.assertEqual(len(p[OTHER]["found"]), 1)

    def test_claim_drops_junk(self):
        c = self.client()
        store = deps.repo()
        store.put(ANON_A, DATE, [{"w": "לאמילה", "cat": "main"}, *found(words(DATE, 1))], 0)
        self.email_login(c, "a@example.com")
        self.claim(c, ANON_A)
        self.assertEqual([f["w"] for f in self.progress(c, ANON_A)[DATE]["found"]], words(DATE, 1))

    def test_claim_again_is_harmless(self):
        c = self.client()
        self.play(c, ANON_A, DATE, words(DATE, 2))
        self.email_login(c, "a@example.com")
        self.claim(c, ANON_A)
        self.assertEqual(self.claim(c, ANON_A).json()["moved"], [])
        self.assertEqual(len(self.progress(c, ANON_A)[DATE]["found"]), 2)

    def test_claim_needs_login(self):
        c = self.client()
        self.assertEqual(self.claim(c, ANON_A).status_code, 401)

    def test_logged_in_saves_go_to_the_account(self):
        phone, laptop = self.client(), self.client()
        self.email_login(phone, "a@example.com")
        self.play(phone, ANON_A, DATE, words(DATE, 1))
        self.email_login(laptop, "a@example.com")
        self.assertIn(DATE, self.progress(laptop, ANON_B))

    def test_after_logout_progress_is_anonymous_again(self):
        c = self.client()
        self.email_login(c, "a@example.com")
        self.play(c, ANON_A, DATE, words(DATE, 1))
        c.post("/api/auth/logout", json={})
        self.assertEqual(self.progress(c, ANON_B), {})

    def test_delete_account(self):
        c = self.client()
        self.email_login(c, "a@example.com")
        self.play(c, ANON_A, DATE, words(DATE, 1))
        self.assertEqual(c.request("DELETE", "/api/auth/me", json={}).status_code, 200)
        self.assertIsNone(self.me(c))
        again = self.client()
        self.email_login(again, "a@example.com")             # a fresh, empty account
        self.assertEqual(self.progress(again, ANON_B), {})


if __name__ == "__main__":
    unittest.main()
