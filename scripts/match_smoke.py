#!/usr/bin/env python3
"""Smoke checks for chat_brain category / catalog matching."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from chat_brain import analyze_request, match_catalog_product  # noqa: E402


CASES = [
    ("10 тонн бетона М300 Астана", "Стройматериалы"),
    ("нужен senior python разработчик", "IT и ПО"),
    ("офисные столы и стулья 20 шт", "Мебель"),
    ("клининг офиса и моющие средства", "Клининг и хозяйственные товары"),
    ("консультация по стратегии бизнеса", "Консалтинг"),
    ("медицинские перчатки и шприцы", "Медицина и фармацевтика"),
    ("тормозные колодки и масляный фильтр", "Автозапчасти"),
    ("бумага А4 и ручки пачкой", "Канцтовары"),
    ("видеонаблюдение и сигнализация", "Безопасность и охрана"),
    ("Бетон М300", "Стройматериалы"),
]


def main() -> int:
    failed = 0
    for text, expect_cat in CASES:
        analysis = analyze_request(text, {})
        cats = analysis.get("categories") or []
        ok = expect_cat in cats or (cats and cats[0] == expect_cat)
        mark = "OK" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"[{mark}] {text!r} -> {cats} (expected {expect_cat})")

    hit = match_catalog_product("бетон м300")
    if hit:
        print(f"[OK] catalog match -> {hit.get('name')} / {hit.get('supplier_id')}")
    else:
        print("[FAIL] catalog match for 'бетон м300'")
        failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll match smoke checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
