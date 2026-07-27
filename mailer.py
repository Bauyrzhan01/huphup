"""Исходящая почта HupHup: SMTP или Resend API.

SMTP (классика):
  SMTP_HOST, SMTP_PORT (587 или 465), SMTP_USER, SMTP_PASSWORD,
  SMTP_FROM, SMTP_TLS (1 для STARTTLS на 587; для 465 обычно 0 + SMTP_SSL=1)

Resend (удобно на Vercel, без SMTP-сокетов):
  RESEND_API_KEY, RESEND_FROM (или SMTP_FROM как fallback)
"""
from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage


def _smtp_host_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def resend_configured() -> bool:
    key = (os.environ.get("RESEND_API_KEY") or "").strip()
    from_addr = (os.environ.get("RESEND_FROM") or os.environ.get("SMTP_FROM") or "").strip()
    return bool(key and from_addr)


def smtp_configured() -> bool:
    """True, если письма можно отправить (SMTP или Resend)."""
    return _smtp_host_configured() or resend_configured()


def _send_resend(to_email: str, subject: str, body: str) -> bool:
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    from_addr = (os.environ.get("RESEND_FROM") or os.environ.get("SMTP_FROM") or "").strip()
    if not api_key or not from_addr:
        return False
    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "text": body,
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "HupHup/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        print(f"[mailer] Resend HTTP {exc.code} to {to_email}: {detail}")
        return False
    except (OSError, urllib.error.URLError) as exc:
        print(f"[mailer] Resend failed to {to_email}: {exc}")
        return False


def _send_smtp(to_email: str, subject: str, body: str) -> bool:
    if not _smtp_host_configured():
        return False
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    from_addr = os.environ.get("SMTP_FROM")
    use_tls = (os.environ.get("SMTP_TLS") or "1").strip().lower() not in ("0", "false", "no")
    use_ssl = (os.environ.get("SMTP_SSL") or "").strip().lower() in ("1", "true", "yes")
    if port == 465 and os.environ.get("SMTP_SSL") is None:
        use_ssl = True
        use_tls = False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ctx) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                if use_tls:
                    smtp.starttls(context=ssl.create_default_context())
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        print(f"[mailer] SMTP send failed to {to_email}: {exc}")
        return False


def send_mail(to_email: str, subject: str, body: str) -> bool:
    """Отправить plaintext-письмо; False если не настроено или ошибка."""
    if not to_email:
        return False
    if resend_configured():
        if _send_resend(to_email, subject, body):
            return True
        if not _smtp_host_configured():
            return False
    if _smtp_host_configured():
        return _send_smtp(to_email, subject, body)
    return False
