"""Опциональные SMTP-уведомления HupHup.

Переменные окружения (нужны только если хотите письма):
  SMTP_HOST, SMTP_PORT (по умолчанию 587), SMTP_USER, SMTP_PASSWORD,
  SMTP_FROM (обязателен вместе с SMTP_HOST), SMTP_TLS (по умолчанию вкл.).

Используется для кода подтверждения регистрации и уведомлений
(новая заявка / новый оффер / дедлайн ответа).
"""
from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def smtp_configured() -> bool:
    """True, если заданы host и from (логин/пароль могут быть пустыми)."""
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def send_mail(to_email: str, subject: str, body: str) -> bool:
    """Отправить plaintext-письмо; False если пропуск или ошибка SMTP."""
    if not to_email or not smtp_configured():
        return False
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    from_addr = os.environ.get("SMTP_FROM")
    use_tls = (os.environ.get("SMTP_TLS") or "1").strip().lower() not in ("0", "false", "no")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            if use_tls:
                smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        print(f"[mailer] send failed to {to_email}: {exc}")
        return False
