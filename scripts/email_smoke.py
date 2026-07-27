#!/usr/bin/env python3
"""Проверка сборки email-текста и опциональная отправка тестового письма."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import app, app_url, build_email_body, email_user, load_users
from mailer import send_mail, smtp_configured


def main() -> int:
    os.environ.setdefault("APP_BASE_URL", "http://127.0.0.1:5000")
    sample = build_email_body("Тестовое уведомление HupHup", user_id=None)
    print("APP_BASE_URL:", os.environ.get("APP_BASE_URL"))
    print("SMTP configured:", smtp_configured())
    print("Sample body:\n", sample)

    to = (os.environ.get("EMAIL_SMOKE_TO") or "").strip()
    if not to:
        users = load_users()
        buyer = next((u for u in users if u.get("role") == "user"), None)
        to = (buyer or {}).get("email") or ""

    if not smtp_configured():
        print("SMTP not configured — dry-run OK")
        return 0

    if not to:
        print("Set EMAIL_SMOKE_TO or seed users for live send")
        return 0

    ok = send_mail(to, "HupHup email smoke", sample + f"\n\nОткрыть: {app_url('/home')}")
    print("Sent to", to, "->", ok)
    return 0 if ok else 1


if __name__ == "__main__":
    with app.app_context():
        raise SystemExit(main())
