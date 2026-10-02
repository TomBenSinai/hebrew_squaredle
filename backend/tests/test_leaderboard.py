"""The leaderboard and the nicknames it shows. From backend/, with the repo root on the path:

    python -m unittest tests.test_leaderboard -v
"""

from __future__ import annotations

import unittest
from unittest import mock

from fastapi.testclient import TestClient

from app import config, leaderboard
from app.boards import get_day
from wordgame import normalize

from tests.test_auth import ANON_A, ANON_B, Base, words

D1, D2, D3 = "2026-09-03", "2026-09-04", "2026-09-05"


class LeaderboardBase(Base):
    def setUp(self):
        super().setUp()
        self.today = D1
        patcher = mock.patch.object(config, "today", lambda: self.today)
        patcher.start()
        self.addCleanup(patcher.stop)

    def put(self, c: TestClient, date: str, ws: list[str], anon: str = ANON_A, cat: str = "main"):
        r = c.put(f"/api/progress/{date}", json={"found": [{"w": w, "cat": cat} for w in ws], "rot": 0},
                  headers={"X-Player-Id": anon})
        self.assertEqual(r.status_code, 200, r.text)

    def player(self, email: str, nickname: str | None) -> TestClient:
        c = self.client()
        self.email_login(c, email)
        if nickname:
            r = c.put("/api/auth/nickname", json={"nickname": nickname})
            self.assertEqual(r.status_code, 200, r.text)
        return c

    def board(self, c: TestClient, date: str = D1, anon: str | None = ANON_A) -> dict:
        r = c.get(f"/api/leaderboard/{date}", headers={"X-Player-Id": anon} if anon else {})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def names(self, part: dict) -> list[tuple[int, str]]:
        return [(r["rank"], r["name"]) for r in part["top"]]


class TestDay(LeaderboardBase):
    def test_ranked_by_main_words_then_finish_then_bonus(self):
        main = words(D1, 999)
        bonus = list(get_day(D1).board.bonus)
        a, b, c, d = (self.player(f"{n}@example.com", n) for n in ("alef", "bet", "gimel", "dalet"))
        self.put(a, D1, main[:3])
        self.put(b, D1, main[:5])
        self.put(c, D1, main[:3] + bonus[:2], cat="bonus")   # cat is the client's guess; the server re-checks
        self.put(d, D1, main)                                # finished
        self.assertEqual(self.names(self.board(a)["day"]), [(1, "dalet"), (2, "bet"), (3, "gimel"), (4, "alef")])
        top = self.board(a)["day"]["top"]
        self.assertTrue(top[0]["done"])
        self.assertEqual((top[2]["main"], top[2]["bonus"]), (3, 2))

    def test_finishing_first_wins_a_tie(self):
        main = words(D1, 999)
        a, b = self.player("a@example.com", "first"), self.player("b@example.com", "second")
        self.put(b, D1, main[:-1])
        self.put(a, D1, main)
        self.put(b, D1, main)
        self.assertEqual(self.names(self.board(a)["day"]), [(1, "first"), (2, "second")])

    def test_equal_rows_share_a_place(self):
        a, b = self.player("a@example.com", "aa"), self.player("b@example.com", "bb")
        self.put(a, D1, words(D1, 2))
        self.put(b, D1, words(D1, 2))
        self.assertEqual([r["rank"] for r in self.board(a)["day"]["top"]], [1, 1])

    def test_archive_play_does_not_count(self):
        a = self.player("a@example.com", "late")
        self.today = D2
        self.put(a, D1, words(D1, 4))          # D1 from the archive, a day late
        day = self.board(a, D1)["day"]
        self.assertEqual((day["players"], day["me"]), (0, None))

    def test_only_nicknamed_players_are_listed_but_everyone_gets_a_place(self):
        listed = self.player("a@example.com", "shown")
        hidden = self.player("b@example.com", None)
        anon = self.client()
        self.put(listed, D1, words(D1, 2))
        self.put(hidden, D1, words(D1, 5))
        self.put(anon, D1, words(D1, 1), anon=ANON_B)
        day = self.board(hidden)["day"]
        self.assertEqual(self.names(day), [(1, "shown")])
        self.assertEqual(day["players"], 1)
        self.assertEqual((day["me"]["rank"], day["me"]["listed"], day["me"]["main"]), (1, False, 5))
        me = self.board(anon, anon=ANON_B)["day"]["me"]
        self.assertEqual((me["rank"], me["listed"]), (2, False))
        self.assertTrue(self.board(listed)["day"]["top"][0]["me"])

    def test_place_below_the_top_rows(self):
        with mock.patch.object(leaderboard, "TOP", 2):
            players = [self.player(f"p{i}@example.com", f"p{i}") for i in range(3)]
            for c, n in zip(players, (4, 3, 2)):
                self.put(c, D1, words(D1, n))
            day = self.board(players[2])["day"]
        self.assertEqual(len(day["top"]), 2)
        self.assertEqual((day["me"]["rank"], day["me"]["listed"], day["players"]), (3, True, 3))

    def test_readable_without_a_player_id(self):
        a = self.player("a@example.com", "aa")
        self.put(a, D1, words(D1, 1))
        body = self.board(self.client(), anon=None)
        self.assertEqual(self.names(body["day"]), [(1, "aa")])
        self.assertIsNone(body["day"]["me"])
        self.assertFalse(body["day"]["top"][0]["me"])

    def test_claimed_progress_brings_its_day_along(self):
        c = self.client()
        self.put(c, D1, words(D1, 3))
        self.email_login(c, "new@example.com")
        self.assertEqual(c.post("/api/auth/claim", json={}, headers={"X-Player-Id": ANON_A}).json()["moved"], [D1])
        c.put("/api/auth/nickname", json={"nickname": "newbie"})
        self.assertEqual(self.board(c)["day"]["top"][0]["main"], 3)

    def test_deleted_account_leaves_the_board(self):
        a = self.player("a@example.com", "gone")
        self.put(a, D1, words(D1, 1))
        a.request("DELETE", "/api/auth/me", json={})
        self.assertEqual(self.board(self.client(), anon=None)["day"]["players"], 0)

    def test_future_days_are_404(self):
        self.assertEqual(self.client().get(f"/api/leaderboard/{D2}").status_code, 404)


class TestStreaks(LeaderboardBase):
    def play_on(self, c: TestClient, *dates: str):
        for d in dates:
            self.today = d
            self.put(c, d, words(d, 1))

    def test_days_in_a_row(self):
        a, b = self.player("a@example.com", "steady"), self.player("b@example.com", "gappy")
        self.play_on(a, D1, D2, D3)
        self.play_on(b, D1, D3)
        st = self.board(a, D3)["streaks"]
        self.assertEqual([(r["name"], r["streak"], r["days"]) for r in st["top"]],
                         [("steady", 3, 3), ("gappy", 1, 2)])

    def test_an_unlisted_player_still_gets_their_streak(self):
        anon = self.client()
        for d in (D1, D2):
            self.today = d
            self.put(anon, d, words(d, 1), anon=ANON_B)
        st = self.board(anon, D2, anon=ANON_B)["streaks"]
        self.assertEqual(st["top"], [])
        self.assertEqual((st["me"]["streak"], st["me"]["listed"]), (2, False))

    def test_still_alive_until_today_is_played(self):
        a = self.player("a@example.com", "aa")
        self.play_on(a, D1, D2)
        self.today = D3
        self.assertEqual(self.board(a, D3)["streaks"]["top"][0]["streak"], 2)
        self.today = "2026-09-06"
        self.assertEqual(self.board(a, D3)["streaks"]["top"], [])

    def test_streak_counts_board_days(self):
        dates = ["2026-09-01", "2026-09-02", "2026-09-04"]   # no board on the 3rd: the run goes on
        self.assertEqual(leaderboard.streak(set(dates), dates, "2026-09-04"), 3)
        self.assertEqual(leaderboard.streak({"2026-09-01"}, dates, "2026-09-04"), 0)


class TestStats(LeaderboardBase):
    def stats(self, date: str = D1) -> dict:
        r = self.client().get(f"/api/leaderboard/{date}/stats")
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_every_account_counts_named_or_not(self):
        main = words(D1, 999)
        self.put(self.player("a@example.com", "aa"), D1, main)                # finished
        self.put(self.player("b@example.com", None), D1, main[:2])           # no nickname
        st = self.stats()
        self.assertEqual(set(st), {"avgWords", "avgFraction"})               # no counts
        self.assertEqual(st["avgWords"], (len(main) + 2) / 2)
        letters = sum(len(normalize(w)) for w in main)
        self.assertAlmostEqual(st["avgFraction"], (letters + sum(len(normalize(w)) for w in main[:2])) / 2 / letters, 3)

    def test_anonymous_play_does_not_count(self):
        # an anonymous row stays beside the account it logged in to: one player, two rows
        main = words(D1, 999)
        self.put(self.player("a@example.com", "aa"), D1, main[:4])
        self.put(self.client(), D1, main[:2], anon=ANON_B)
        self.assertEqual(self.stats()["avgWords"], None)
        self.put(self.player("b@example.com", None), D1, main[:2])
        self.assertEqual(self.stats()["avgWords"], 3)

    def test_no_average_until_two_played(self):
        self.assertEqual(self.stats(), {"avgWords": None, "avgFraction": None})
        self.put(self.player("a@example.com", None), D1, words(D1, 3))
        self.assertEqual(self.stats()["avgWords"], None)

    def test_archive_play_does_not_count(self):
        self.today = D2
        self.put(self.player("a@example.com", None), D1, words(D1, 3))
        self.put(self.player("b@example.com", None), D1, words(D1, 3))
        self.assertEqual(self.stats()["avgWords"], None)


class TestNickname(LeaderboardBase):
    def test_shown_in_me_and_cleared_by_null(self):
        c = self.player("a@example.com", "  דני   כהן ")
        self.assertEqual(self.me(c)["nickname"], "דני כהן")
        self.assertEqual(c.put("/api/auth/nickname", json={"nickname": None}).json(), {"nickname": None})
        self.assertIsNone(self.me(c)["nickname"])

    def test_bad_names_are_refused(self):
        c = self.player("a@example.com", None)
        for bad in ["x", "a" * 21, "שלום!", "-אבג", "a‏b", "תּום"]:
            with self.subTest(nickname=bad):
                r = c.put("/api/auth/nickname", json={"nickname": bad})
                self.assertEqual((r.status_code, r.json()["detail"]), (422, "bad_nickname"))

    def test_taken_whatever_the_case(self):
        self.player("a@example.com", "Tom")
        c = self.player("b@example.com", None)
        r = c.put("/api/auth/nickname", json={"nickname": "tom"})
        self.assertEqual((r.status_code, r.json()["detail"]), (409, "nickname_taken"))
        self.assertEqual(c.put("/api/auth/nickname", json={"nickname": "תום"}).status_code, 200)

    def test_needs_an_account(self):
        r = self.client().put("/api/auth/nickname", json={"nickname": "anon"})
        self.assertEqual(r.status_code, 401)


if __name__ == "__main__":
    unittest.main()
