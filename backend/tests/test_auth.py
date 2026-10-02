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


class TestLoginIsOptional(Base):
    """A player who never logs in plays and keeps progress exactly as before login existed."""

    def test_whole_game_without_a_session(self):
        c = self.client()
        self.assertEqual(c.get("/api/days").status_code, 200)
        self.assertEqual(c.get(f"/api/boards/{DATE}").status_code, 200)
        self.assertEqual(c.post(f"/api/boards/{DATE}/check", json={"path": [0, 1, 2]}).status_code, 200)
        self.assertEqual(c.post(f"/api/boards/{DATE}/live-cells", json={"found": []}).status_code, 200)
        self.play(c, ANON_A, DATE, words(DATE, 2))
        self.assertEqual(len(c.get(f"/api/progress/{DATE}", headers={"X-Player-Id": ANON_A}).json()["found"]), 2)
        self.assertEqual(set(self.progress(c, ANON_A)), {DATE})
        self.assertNotIn("ribuon_session", c.cookies)

    def test_nothing_is_offered_when_login_is_off(self):
        with mock.patch.object(config, "GOOGLE_CLIENT_ID", ""), mock.patch.object(config, "EMAIL_LOGIN", False):
            c = self.client()
            self.assertEqual(c.get("/api/auth/me").json(),
                             {"providers": {"google": False, "email": False}, "user": None, "newAccount": False})
            self.play(c, ANON_A, DATE, words(DATE, 1))
            self.assertIn(DATE, self.progress(c, ANON_A))


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

    def test_dead_session_is_refused_then_cleared(self):
        c = self.client()
        self.email_login(c, "a@example.com")
        deps.accounts()._db.execute("DELETE FROM sessions")   # expired, or ended elsewhere
        # not read as anonymous: the device may hold an account's progress
        r = c.put(f"/api/progress/{DATE}", json={"found": found(words(DATE, 1)), "rot": 0},
                  headers={"X-Player-Id": ANON_A})
        self.assertEqual((r.status_code, r.json()["detail"]), (401, "session_ended"))
        self.assertIsNone(self.me(c))               # clears the cookie
        self.play(c, ANON_A, DATE, words(DATE, 1))
        self.assertIn(DATE, self.progress(c, ANON_A))

    def test_writes_must_be_json(self):
        c = self.client()
        r = c.post("/api/auth/email/start", content="email=a@example.com",
                   headers={"Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(r.status_code, 415)
        r = c.post("/api/auth/logout", content="", headers={"Content-Type": "text/plain"})
        self.assertEqual(r.status_code, 415)


class TestRateLimit(unittest.TestCase):
    def test_quiet_keys_are_dropped(self):
        now = [0.0]
        rl = auth.RateLimit(2, 60)
        with mock.patch.object(auth.time, "monotonic", lambda: now[0]):
            for i in range(100):
                rl.hit(f"ip{i}")
            now[0] = 61
            self.assertTrue(rl.hit("fresh"))
        self.assertEqual(set(rl._hits), {"fresh"})


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

    def test_sessions_from_before_new_accounts_were_marked_still_work(self):
        path = Path(self.repo._db.execute("PRAGMA database_list").fetchone()["file"])
        old = self.repo.create_session(self.user["id"])
        self.repo._db.execute("ALTER TABLE sessions DROP COLUMN made_user")
        reopened = AccountRepo(path, clock=lambda: self.now)
        self.assertEqual(reopened.session_user(old)["made_here"], False)
        self.assertTrue(reopened.session_user(reopened.create_session(self.user["id"], True))["made_here"])


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
        for bad in ("not-an-email", "a@example.com,1", "a@example.com, b@example.com", "a@example.com;b",
                    '"a b"@example.com', "<a@example.com>", "a@example"):
            with self.subTest(bad=bad):
                self.assertEqual(c.post("/api/auth/email/start", json={"email": bad}).status_code, 422)
        self.assertEqual(self.sent, [])
        self.assertEqual(c.post("/api/auth/email/start", json={"email": "Tom.B+x@mail.co.il"}).status_code, 200)

    def test_failed_send_does_not_count(self):
        c = self.client()
        with mock.patch.object(mailer, "send_login_link", side_effect=OSError("relay down")):
            for _ in range(auth.LINKS_PER_ADDRESS):
                self.assertEqual(c.post("/api/auth/email/start", json={"email": "a@example.com"}).status_code, 502)
        self.assertEqual(c.post("/api/auth/email/start", json={"email": "a@example.com"}).status_code, 200)

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


class FakeSMTP:
    """Stands in for smtplib.SMTP / SMTP_SSL: records how it was used."""
    made: list["FakeSMTP"] = []

    def __init__(self, host, port, **kw):
        self.port, self.tls, self.sent = port, "context" in kw, []
        FakeSMTP.made.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context):
        self.tls = "starttls"

    def login(self, user, password):
        pass

    def send_message(self, msg):
        self.sent.append(msg)


class TestMailer(unittest.TestCase):
    def send(self, port: int) -> FakeSMTP:
        FakeSMTP.made = []
        with mock.patch.object(config, "SMTP_HOST", "smtp.example.com"), \
                mock.patch.object(config, "SMTP_PORT", port), \
                mock.patch.object(config, "MAIL_REPLY_TO", "me@example.com"), \
                mock.patch("smtplib.SMTP", FakeSMTP), mock.patch("smtplib.SMTP_SSL", FakeSMTP):
            mailer.send_login_link("player@example.com", "tok")
        return FakeSMTP.made[0]

    def test_replies_go_to_the_reply_to_address(self):
        msg = self.send(2587).sent[0]
        self.assertEqual(msg["Reply-To"], "me@example.com")
        self.assertIn("/#login=tok", msg.get_body(("plain",)).get_content())

    def test_ports_that_get_past_a_blocked_587(self):
        self.assertEqual(self.send(2587).tls, "starttls")
        self.assertEqual(self.send(2465).tls, True)          # SMTP_SSL, TLS from the start


class TestGoogleLogin(Base):
    def test_login(self):
        c = self.client()
        r = self.google_login(c)
        self.assertEqual(r.headers["location"], "/?login=google")
        self.assertEqual(self.me(c), {"name": "Tom", "email": "tom@example.com", "nickname": None})

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

    def test_odd_token_endpoint_answers_fail_cleanly(self):
        for answer, claims in ((httpx.Response(200, text="<html>portal</html>"), None),
                               (httpx.Response(200, json=["x"]), None),
                               (None, "[1, 2]")):
            with self.subTest(answer=answer, claims=claims):
                c = self.client()
                state, _ = self.google_start(c)
                if answer is None:
                    part = base64.urlsafe_b64encode(claims.encode()).rstrip(b"=").decode()
                    answer = httpx.Response(200, json={"id_token": f"h.{part}.s"})
                real = httpx.AsyncClient
                with mock.patch.object(google.httpx, "AsyncClient",
                                       lambda **kw: real(transport=httpx.MockTransport(lambda r: answer), **kw)):
                    r = c.get(f"/api/auth/google/callback?state={state}&code=abc", follow_redirects=False)
                self.assertEqual(r.headers["location"], "/?login=failed")

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

    def test_only_the_device_that_made_the_account_brings_its_progress(self):
        phone, laptop = self.client(), self.client()
        self.play(phone, ANON_A, DATE, words(DATE, 2))
        self.play(laptop, ANON_B, DATE, words(DATE, 2, skip=1))
        self.play(laptop, ANON_B, OTHER, words(OTHER, 1))
        for c, anon in ((phone, ANON_A), (laptop, ANON_B)):
            self.email_login(c, "a@example.com")
            self.claim(c, anon)
        for c in (phone, laptop):
            p = self.progress(c, "ignored-id")
            self.assertEqual([f["w"] for f in p[DATE]["found"]], words(DATE, 2))
            self.assertNotIn(OTHER, p)
        # the laptop's anonymous progress stays where it was
        self.assertEqual(set(self.progress(self.client(), ANON_B)), {DATE, OTHER})

    def test_new_account_is_told_to_the_session_that_made_it(self):
        phone, laptop = self.client(), self.client()
        self.email_login(phone, "a@example.com")
        self.assertTrue(phone.get("/api/auth/me").json()["newAccount"])
        self.email_login(laptop, "a@example.com")
        self.assertFalse(laptop.get("/api/auth/me").json()["newAccount"])
        phone.post("/api/auth/logout", json={})
        self.email_login(phone, "a@example.com")              # back on the phone: not new anymore
        self.assertFalse(phone.get("/api/auth/me").json()["newAccount"])

    def test_google_login_to_an_email_account_is_not_new(self):
        c = self.client()
        self.email_login(self.client(), "tom@example.com")
        self.play(c, ANON_A, DATE, words(DATE, 1))
        self.google_login(c, email="tom@example.com")
        self.assertFalse(c.get("/api/auth/me").json()["newAccount"])
        self.assertEqual(self.claim(c, ANON_A).json()["moved"], [])

    def test_claim_drops_junk(self):
        c = self.client()
        store = deps.repo()
        store.put(ANON_A, DATE, [{"w": "לאמילה", "cat": "main"}, *found(words(DATE, 1))], 0)
        self.email_login(c, "a@example.com")
        self.claim(c, ANON_A)
        self.assertEqual([f["w"] for f in self.progress(c, ANON_A)[DATE]["found"]], words(DATE, 1))

    def test_claim_happens_once(self):
        c = self.client()
        self.play(c, ANON_A, DATE, words(DATE, 2))
        self.email_login(c, "a@example.com")
        self.claim(c, ANON_A)
        self.assertFalse(c.get("/api/auth/me").json()["newAccount"])
        # someone else's anonymous id can't be pulled in later
        self.play(self.client(), ANON_B, OTHER, words(OTHER, 1))
        self.assertEqual(self.claim(c, ANON_B).json()["moved"], [])
        self.assertNotIn(OTHER, self.progress(c, ANON_A))
        self.assertEqual(len(self.progress(c, ANON_A)[DATE]["found"]), 2)

    def test_verify_says_whether_the_account_is_new(self):
        c = self.client()
        c.post("/api/auth/email/start", json={"email": "a@example.com"})
        self.assertTrue(c.post("/api/auth/email/verify", json={"token": self.sent[-1][1]}).json()["newAccount"])
        other = self.client()
        other.post("/api/auth/email/start", json={"email": "a@example.com"})
        self.assertFalse(other.post("/api/auth/email/verify", json={"token": self.sent[-1][1]}).json()["newAccount"])

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

    def test_deleting_on_one_device_ends_the_others(self):
        phone, laptop = self.client(), self.client()
        self.email_login(phone, "a@example.com")
        self.email_login(laptop, "a@example.com")
        phone.request("DELETE", "/api/auth/me", json={})
        # the laptop's copy of the account's progress doesn't go up as anonymous
        r = laptop.put(f"/api/progress/{DATE}", json={"found": found(words(DATE, 1)), "rot": 0},
                       headers={"X-Player-Id": ANON_B})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.progress(self.client(), ANON_B), {})


if __name__ == "__main__":
    unittest.main()
