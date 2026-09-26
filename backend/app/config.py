"""Paths and settings, all overridable from the environment (see docker-compose.yml)."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# The repo root holds wordgame.py, boards/ and shapes.json.
REPO_ROOT = Path(os.environ.get("RIBUON_ROOT", Path(__file__).resolve().parents[2]))
BOARDS_DIR = Path(os.environ.get("RIBUON_BOARDS", REPO_ROOT / "boards" / "daily"))
SHAPES_FILE = REPO_ROOT / "shapes.json"
DB_PATH = Path(os.environ.get("RIBUON_DB", REPO_ROOT / "backend" / "ribuon.db"))
CORS_ORIGINS = [o for o in os.environ.get("RIBUON_CORS", "").split(",") if o]

# Login (optional; see docs/DEPLOY.md). The site's own address, as players open it:
# Google sends them back to it and the email links point at it.
PUBLIC_URL = os.environ.get("RIBUON_PUBLIC_URL", "http://localhost:5174").rstrip("/")
# Session cookies are Secure whenever the site is served over https.
COOKIE_SECURE = PUBLIC_URL.startswith("https://")

# Sign in with Google: an OAuth client of type "Web application" whose redirect
# URI is PUBLIC_URL + /api/auth/google/callback. Unset = no Google button.
GOOGLE_CLIENT_ID = os.environ.get("RIBUON_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("RIBUON_GOOGLE_CLIENT_SECRET", "")

# Email login links go out over SMTP (any relay: Resend, Brevo, SES, Gmail...).
# Port 465 is TLS from the start, anything else upgrades with STARTTLS.
# Without a host email login is off, unless RIBUON_MAIL_TO_LOG=1 (development):
# then the links are only written to the log.
SMTP_HOST = os.environ.get("RIBUON_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("RIBUON_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("RIBUON_SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("RIBUON_SMTP_PASSWORD", "")
MAIL_FROM = os.environ.get("RIBUON_MAIL_FROM", "ריבועון <login@ribuon.com>")
MAIL_TO_LOG = os.environ.get("RIBUON_MAIL_TO_LOG") == "1"
EMAIL_LOGIN = bool(SMTP_HOST) or MAIL_TO_LOG

ISRAEL = ZoneInfo("Asia/Jerusalem")


def today() -> str:
    """Today's date in Israel. RIBUON_TODAY pins it (handy for testing future boards)."""
    return os.environ.get("RIBUON_TODAY") or datetime.now(ISRAEL).date().isoformat()
