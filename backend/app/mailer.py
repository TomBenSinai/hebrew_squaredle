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

LEAD = ("לחצו על הכפתור כדי להתחבר למשתמש - ההתקדמות שלכם במשחק תישמר ותוכלו להתחבר עם המשתמש"
        " במכשירים אחרים ולהמשיך מאיפה שהפסקתם!")

FINE = "הקישור תקף ל־15 דקות ולשימוש אחד. לא ביקשתם להיכנס? אפשר להתעלם מהמייל הזה."

# ‏ (RLM) starts each line right-to-left in clients that show the plain text
TEXT = "‏" + LEAD + "\n\n{link}\n\n‏" + FINE + "\n"

# Gmail and others drop <html> and <body> attributes, so the direction and the
# alignment are set again on the table and on every cell.
HTML = """<!doctype html>
<html lang="he" dir="rtl"><body dir="rtl" style="margin:0;padding:24px;background:#ECECEA;font-family:Arial,sans-serif;color:#111">
<div dir="rtl" style="direction:rtl;text-align:right">
<table role="presentation" dir="rtl" width="100%" style="direction:rtl;max-width:460px;margin:0 auto;background:#fff;border:1.5px solid #111;border-radius:4px">
<tr><td dir="rtl" align="right" style="direction:rtl;text-align:right;padding:20px 24px 12px;border-bottom:1.5px solid #111">
  <div style="font-size:28px;font-weight:800;line-height:1">ריבועון</div>
</td></tr>
<tr><td dir="rtl" align="right" style="direction:rtl;text-align:right;padding:20px 24px 26px;font-size:16px;line-height:1.5">
  <p style="margin:0 0 18px">{lead}</p>
  <p style="margin:0 0 18px"><a href="{link}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;
    border-radius:10px;text-decoration:none;font-weight:700">כניסה לריבועון</a></p>
  <p style="margin:0;color:#6A6A67;font-size:14px">{fine}</p>
</td></tr>
</table>
</div>
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
    if config.MAIL_REPLY_TO:
        msg["Reply-To"] = config.MAIL_REPLY_TO
    msg.set_content(TEXT.format(link=link))
    msg.add_alternative(HTML.format(link=escape(link, quote=True), lead=escape(LEAD), fine=escape(FINE)),
                        subtype="html")

    context = ssl.create_default_context()
    implicit_tls = config.SMTP_PORT in (465, 2465)
    if implicit_tls:
        smtp = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=context, timeout=15)
    else:
        smtp = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
    with smtp:
        if not implicit_tls:
            smtp.starttls(context=context)
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)
