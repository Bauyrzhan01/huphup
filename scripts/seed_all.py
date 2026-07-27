#!/usr/bin/env python3
"""Демо-данные: поставщики + каталог + импорт в SQLite одной командой."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import db


def main() -> int:
    py = sys.executable
    scripts = ROOT / "scripts"
    for name in ("seed_demo_suppliers.py", "seed_catalog.py"):
        print(f"\n==> {name}")
        subprocess.run([py, str(scripts / name)], check=True)

    print("\n==> migrate JSON -> SQLite")
    counts = db.migrate_from_json(ROOT / "data")
    print("DB:", db.db_path())
    for k, v in counts.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
