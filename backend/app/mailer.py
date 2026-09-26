"""Sends the email login link, over SMTP with the standard library."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from . import config

log = logging.getLogger("ribuon.mail")

SUBJECT = "הקישור שלך לכניסה לריבועון"

TEXT = """שלום,

לכניסה לריבועון, פתחו את הקישור:
{link}

הקישור תקף ל־15 דקות ולשימוש אחד.
לא ביקשתם להיכנס? אפשר להתעלם מהמייל הזה.
"""

HTML = """<!doctype html>
<html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#ECECEA;font-family:Arial,sans-serif;color:#111">
<table role="presentation" width="100%" style="max-width:460px;margin:0 auto;background:#fff;border:1.5px solid #111;border-radius:4px">
<tr><td style="padding:20px 24px 12px;border-bottom:1.5px solid #111">
  <div style="font-size:28px;font-weight:800;line-height:1">ריבועון</div>
</td></tr>
<tr><td style="padding:20px 24px 26px;font-size:16px;line-height:1.5">
  <p style="margin:0 0 18px">לחצו כדי להיכנס. ההתקדמות שלכם תחכה בכל מכשיר.</p>
  <p style="margin:0 0 18px"><a href="{link}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;
    border-radius:10px;text-decoration:none;font-weight:700">כניסה לריבועון</a></p>
  <p style="margin:0;color:#6A6A67;font-size:14px">הקישור תקף ל־15 דקות ולשימוש אחד.
    לא ביקשתם להיכנס? אפשר להתעלם מהמייל הזה.</p>
</td></tr>
</table>
</body></html>
"""


def login_link(token: str) -> str:
    # after the # so it never reaches a server log or a Referer header
    return f"{config.PUBLIC_URL}/#login={token}"


def send_login_link(to: str, token: str) -> None:
    link = login_link(token)
    if not config.SMTP_HOST:
        log.warning("email login link for %s (not sent, no SMTP): %s", to, link)
        return
    msg = EmailMessage()
    msg["Subject"] = SUBJECT
    msg["From"] = config.MAIL_FROM
    msg["To"] = to
    msg.set_content(TEXT.format(link=link))
    msg.add_alternative(HTML.format(link=escape(link, quote=True)), subtype="html")

    context = ssl.create_default_context()
    if config.SMTP_PORT == 465:
        smtp = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=context, timeout=15)
    else:
        smtp = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
    with smtp:
        if config.SMTP_PORT != 465:
            smtp.starttls(context=context)
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)
