"""ריבועוני: the 3x3 board for logged-in players only.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from tests.test_auth import ANON_A, DATE, Base, found  # sets up config first

from app import config  # noqa: E402
from app.boards import get_day  # noqa: E402

TODAY = config.today()
MINI = f"mini-{TODAY}"
# any stored ריבועוני will do: it is copied in as today's
SOURCE = next(iter(sorted((config.REPO_ROOT / "boards" / "mini").glob("*.json"))))


class TestMini(Base):
    def setUp(self):
        super().setUp()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        board = json.loads(SOURCE.read_text(encoding="utf-8"))
        board["date"] = TODAY
        (Path(tmp.name) / f"{TODAY}.json").write_text(json.dumps(board, ensure_ascii=False), encoding="utf-8")
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
        # its own row, beside the big board's, and never on the leaderboard
        everything = c.get("/api/progress").json()
        self.assertEqual(list(everything), [MINI])
        self.assertEqual(c.get(f"/api/leaderboard/{MINI}").status_code, 404)
        self.assertEqual(c.get(f"/api/leaderboard/{MINI}/stats").status_code, 404)

    def test_only_todays(self):
        c = self.client()
        self.email_login(c, "mini@example.com")
        self.assertEqual(c.get(f"/api/boards/mini-{DATE}").status_code, 404)
        self.assertEqual(c.get("/api/boards/mini-2099-01-01").status_code, 404)

    def test_the_big_board_is_unchanged(self):
        self.assertFalse(get_day(DATE).mini)
        self.assertEqual(self.client().get(f"/api/boards/{DATE}").json()["date"], DATE)
