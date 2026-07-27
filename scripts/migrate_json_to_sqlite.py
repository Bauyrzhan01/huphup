#!/usr/bin/env python3
"""Перенос data/*.json в SQLite (по умолчанию data/huphup.db).

Запускайте после seed-скриптов (они пишут только JSON). Живое приложение
с USE_SQLITE=1 читает БД; перезапустите эту CLI, чтобы обновить SQLite из JSON.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import db


def main() -> int:
    counts = db.migrate_from_json(ROOT / "data")
    print("Migrated into", db.db_path())
    for k, v in counts.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
