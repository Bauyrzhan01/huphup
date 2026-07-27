#!/usr/bin/env python3
"""Push mail-related vars from .env to Vercel (production).

Usage (from repo root, after filling .env):
  python scripts/push_mail_env_vercel.py

Requires: vercel CLI logged in, .env with SMTP_* or RESEND_*.
Does not print secret values.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
KEYS = (
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SMTP_TLS",
    "SMTP_SSL",
    "RESEND_API_KEY",
    "RESEND_FROM",
)


def load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def push_key(key: str, value: str) -> bool:
    sensitive = key in ("SMTP_PASSWORD", "RESEND_API_KEY", "FLASK_SECRET_KEY", "DATABASE_URL")
    cmd = [
        "npx",
        "vercel",
        "env",
        "add",
        key,
        "production",
        "--force",
        "--yes",
        "--value",
        value,
    ]
    if sensitive:
        cmd.append("--sensitive")
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            print(f"  FAIL {key}: {err[:200]}")
            return False
        print(f"  OK   {key}")
        return True
    except subprocess.TimeoutExpired:
        print(f"  FAIL {key}: timeout")
        return False


def main() -> int:
    env = load_dotenv(ENV_PATH)
    if not ENV_PATH.is_file():
        print(f"Missing {ENV_PATH} — copy .env.example and set SMTP_* or RESEND_*")
        return 1

    todo = [(k, env[k]) for k in KEYS if env.get(k)]
    if not todo:
        print("No SMTP_* or RESEND_* in .env — nothing to push.")
        print("Example Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_TLS=1")
        print("Or Resend: RESEND_API_KEY=re_... RESEND_FROM=HupHup <onboarding@resend.dev>")
        return 1

    if not (env.get("RESEND_API_KEY") or (env.get("SMTP_HOST") and env.get("SMTP_FROM"))):
        print("Incomplete mail config: need RESEND_API_KEY+RESEND_FROM or SMTP_HOST+SMTP_FROM")
        return 1

    print(f"Pushing {len(todo)} variable(s) to Vercel production…")
    ok = all(push_key(k, v) for k, v in todo)
    if ok:
        print("Done. Redeploy: npx vercel --prod")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
