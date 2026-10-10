"""ריבועוני: the 3x3 board for logged-in players only.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import tempfile
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from tests.test_auth import ANON_A, DATE, Base, found  # sets up config first

from app import config  # noqa: E402
from app.boards import get_day  # noqa: E402

TODAY = config.today()
MINI = f"mini-{TODAY}"
YESTERDAY = (date.fromisoformat(TODAY) - timedelta(days=1)).isoformat()
# any stored ריבועוני will do: it is copied in as today's
SOURCE = next(iter(sorted((config.REPO_ROOT / "boards" / "mini").glob("*.json"))))


class TestMini(Base):
    def setUp(self):
        super().setUp()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        board = json.loads(SOURCE.read_text(encoding="utf-8"))
        for day in (YESTERDAY, TODAY):
            board["date"] = day
            (Path(tmp.name) / f"{day}.json").write_text(json.dumps(board, ensure_ascii=False), encoding="utf-8")
        patcher = mock.patch.object(config, "MINI_DIR", Path(tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.words = list(board["main"])[:2]

    def test_days_names_todays_mini(self):
        self.assertEqual(self.client().get("/api/days").json()["mini"], MINI)

    def test_logged_out_gets_nothing_of_it(self):
        c = self.client()
        for r in (c.get(f"/api/boards/{MINI}"),
                  c.post(f"/api/boards/{MINI}/check", json={"path": [0, 1, 2, 3]}),
                  c.post(f"/api/boards/{MINI}/live-cells", json={"found": []}),
                  c.put(f"/api/progress/{MINI}", json={"found": found(self.words), "rot": 0},
                        headers={"X-Player-Id": ANON_A})):
            self.assertEqual((r.status_code, r.json()["detail"]), (401, "login_required"))

    def test_logged_in_plays_and_keeps_it_apart(self):
        c = self.client()
        self.email_login(c, "mini@example.com")
        b = c.get(f"/api/boards/{MINI}").json()
        self.assertEqual((b["date"], len(b["letters"]), b["mask"]), (MINI, 9, ["XXX", "XXX", "XXX"]))
        r = c.put(f"/api/progress/{MINI}", json={"found": found(self.words + ["לא-מילה"]), "rot": 2})
        self.assertEqual([f["w"] for f in r.json()["found"]], self.words)
        # its own row, beside the big board's
        everything = c.get("/api/progress").json()
        self.assertEqual(list(everything), [MINI])

    def test_its_own_leaderboard_and_streak(self):
        c = self.client()
        self.email_login(c, "mini@example.com")
        self.assertEqual(c.put("/api/auth/nickname", json={"nickname": "מיני"}).status_code, 200)
        c.put(f"/api/progress/{MINI}", json={"found": found(self.words), "rot": 0})
        mini = c.get(f"/api/leaderboard/{MINI}").json()
        self.assertEqual([(r["name"], r["main"]) for r in mini["day"]["top"]], [("מיני", 2)])
        self.assertEqual([r["streak"] for r in mini["streaks"]["top"]], [1])
        # the big board's lists know nothing of it
        big = c.get(f"/api/leaderboard/{TODAY}").json()
        self.assertEqual((big["day"]["top"], big["streaks"]["top"]), ([], []))
        self.assertEqual(c.get(f"/api/leaderboard/{MINI}/stats").status_code, 200)
        # and logged out there is no ריבועוני list at all
        self.assertEqual(self.client().get(f"/api/leaderboard/{MINI}").status_code, 401)

    def test_a_dead_session_is_told_so(self):
        c = self.client()
        c.cookies.set("ribuon_session", "expired-or-revoked")
        r = c.get(f"/api/boards/{MINI}")
        self.assertEqual((r.status_code, r.json()["detail"]), (401, "session_ended"))

    def test_only_todays_is_offered_but_a_late_save_lands(self):
        c = self.client()
        self.email_login(c, "mini@example.com")
        self.assertEqual(c.put("/api/auth/nickname", json={"nickname": "מאחרת"}).status_code, 200)
        # a word found just before midnight, sent after it: kept, but not on the day's list
        r = c.put(f"/api/progress/mini-{YESTERDAY}", json={"found": found(self.words), "rot": 0})
        self.assertEqual([f["w"] for f in r.json()["found"]], self.words)
        self.assertEqual(c.get(f"/api/leaderboard/mini-{YESTERDAY}").json()["day"]["top"], [])
        self.assertEqual(c.get("/api/days").json()["mini"], MINI)
        for gone in (f"mini-{DATE}", "mini-2099-01-01", "mini-..", "mini-2026-9-1"):
            self.assertEqual(c.get(f"/api/boards/{gone}").status_code, 404, gone)

    def test_the_big_board_is_unchanged(self):
        self.assertFalse(get_day(DATE).mini)
        self.assertEqual(self.client().get(f"/api/boards/{DATE}").json()["date"], DATE)
