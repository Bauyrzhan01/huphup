"""Сиды категорий, подкатегорий и демо-карточек товаров.

Пишет только data/catalog.json. Для живого приложения на SQLite затем:
  python3 scripts/migrate_json_to_sqlite.py
"""
from pathlib import Path
import json
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
USERS_FILE = ROOT / "data" / "users.json"
CATALOG_FILE = ROOT / "data" / "catalog.json"

CATALOG = [
    {
        "id": "stroymaterials",
        "name": "Стройматериалы",
        "subcategories": [
            {"id": "concrete", "name": "Бетон и цемент"},
            {"id": "brick", "name": "Кирпич и блоки"},
            {"id": "wood", "name": "Пиломатериалы"},
            {"id": "insulation", "name": "Утеплитель и кровля"},
        ],
    },
    {
        "id": "construction",
        "name": "Строительство",
        "subcategories": [
            {"id": "genpodryad", "name": "Генподряд"},
            {"id": "roads", "name": "Дороги и инфраструктура"},
            {"id": "facade", "name": "Фасады"},
        ],
    },
    {
        "id": "it",
        "name": "IT и ПО",
        "subcategories": [
            {"id": "web", "name": "Сайты и веб"},
            {"id": "mobile", "name": "Мобильные приложения"},
            {"id": "crm", "name": "CRM / ERP"},
            {"id": "outstaff", "name": "Разработчики (outstaff)"},
        ],
    },
    {
        "id": "office_tech",
        "name": "Оргтехника и компьютеры",
        "subcategories": [
            {"id": "pc", "name": "Компьютеры и ноутбуки"},
            {"id": "print", "name": "Принтеры и МФУ"},
            {"id": "periphery", "name": "Периферия"},
        ],
    },
    {
        "id": "furniture",
        "name": "Мебель",
        "subcategories": [
            {"id": "office_furniture", "name": "Офисная мебель"},
            {"id": "home_furniture", "name": "Домашняя мебель"},
            {"id": "custom_furniture", "name": "Мебель на заказ"},
        ],
    },
    {
        "id": "food",
        "name": "Продукты питания",
        "subcategories": [
            {"id": "dairy", "name": "Молочные продукты"},
            {"id": "meat", "name": "Мясо и полуфабрикаты"},
            {"id": "grocery", "name": "Бакалея"},
        ],
    },
    {
        "id": "transport",
        "name": "Транспорт",
        "subcategories": [
            {"id": "cargo", "name": "Грузоперевозки"},
            {"id": "rent", "name": "Аренда транспорта"},
        ],
    },
    {
        "id": "electro",
        "name": "Электротехника",
        "subcategories": [
            {"id": "cable", "name": "Кабели и провода"},
            {"id": "lighting", "name": "Освещение"},
            {"id": "panels", "name": "Щиты и автоматика"},
        ],
    },
]

# category name -> sample products (name, subcategory id, unit, description)
# Prices are NEVER stored on catalog products — only on request offers.
PRODUCT_TEMPLATES = {
    "Стройматериалы": [
        ("Бетон М300", "concrete", "м³", "Товарный бетон М300 с доставкой"),
        ("Бетон М350", "concrete", "м³", "Товарный бетон М350"),
        ("Цемент М400", "concrete", "мешок", "Портландцемент М400, 50 кг"),
        ("Цемент М500", "concrete", "мешок", "Портландцемент М500, 50 кг"),
        ("Кирпич керамический", "brick", "шт", "Рядовой керамический кирпич"),
        ("Блок газобетонный", "brick", "шт", "Газоблок D500"),
        ("Брус 100x100", "wood", "м³", "Хвойный брус естественной влажности"),
        ("Доска обрезная 50x150", "wood", "м³", "Обрезная доска, 6 м"),
        ("Минеральная вата", "insulation", "уп", "Утеплитель 50 мм"),
        ("Профнастил", "insulation", "м²", "Кровельный профнастил"),
    ],
    "Строительство": [
        ("Генподряд жилого дома", "genpodryad", "объект", "Полный цикл строительства"),
        ("Генподряд коммерческого объекта", "genpodryad", "объект", "Строительство под ключ"),
        ("Асфальтирование", "roads", "м²", "Укладка асфальта"),
        ("Вентилируемый фасад", "facade", "м²", "Монтаж фасадных систем"),
    ],
    "IT и ПО": [
        ("Корпоративный сайт", "web", "проект", "Дизайн + вёрстка + CMS"),
        ("Мобильное приложение", "mobile", "проект", "iOS и Android"),
        ("Внедрение CRM", "crm", "проект", "Настройка и интеграции"),
        ("Senior Python разработчик", "outstaff", "мес", "Full-time outstaff"),
        ("Middle React разработчик", "outstaff", "мес", "Full-time outstaff"),
    ],
    "Оргтехника и компьютеры": [
        ("Офисный ПК", "pc", "шт", "Intel i5 / 16GB / SSD 512"),
        ("Ноутбук 15.6\"", "pc", "шт", "Для офиса и учёбы"),
        ("МФУ лазерное", "print", "шт", "Печать / сканер / копир"),
        ("Клавиатура + мышь", "periphery", "комплект", "Беспроводной набор"),
    ],
    "Мебель": [
        ("Офисный стол", "office_furniture", "шт", "120x60 см"),
        ("Кресло руководителя", "office_furniture", "шт", "Эргономичное кресло"),
        ("Диван 3-местный", "home_furniture", "шт", "Тканевая обивка"),
        ("Кухня на заказ", "custom_furniture", "проект", "По размерам клиента"),
    ],
    "Продукты питания": [
        ("Молоко 3.2%", "dairy", "л", "Опт от 100 л"),
        ("Говядина охлаждённая", "meat", "кг", "Оптовые поставки"),
        ("Рис оптом", "grocery", "кг", "Мешок 25 кг"),
    ],
    "Транспорт": [
        ("Грузоперевозка 20 т", "cargo", "рейс", "Межгород"),
        ("Аренда самосвала", "rent", "смена", "С водителем"),
    ],
    "Электротехника": [
        ("Кабель ВВГ 3x2.5", "cable", "м", "Медный кабель"),
        ("LED светильник", "lighting", "шт", "Офисный 36W"),
        ("Автомат 16А", "panels", "шт", "Однополюсный"),
    ],
    "Ремонт и отделка": [
        ("Штукатурные работы", "general", "м²", "Внутренняя отделка"),
        ("Поклейка обоев", "general", "м²", "Подготовка + поклейка"),
    ],
    "Оборудование": [
        ("Промышленный станок", "general", "шт", "Поставка и пусконаладка"),
    ],
    "Промышленное оборудование": [
        ("Конвейерная линия", "general", "комплект", "Проектирование и монтаж"),
    ],
    "Телекоммуникации": [
        ("Монтаж СКС", "general", "порт", "Структурированная кабельная сеть"),
    ],
    "Сельское хозяйство": [
        ("Корма для скота", "general", "т", "Оптовые поставки"),
    ],
    "Логистика и доставка": [
        ("Складское хранение", "general", "м²/мес", "Отапливаемый склад"),
        ("Курьерская доставка", "general", "заказ", "По городу"),
    ],
    "Автозапчасти": [
        ("Фильтр масляный", "general", "шт", "Опт"),
    ],
    "Одежда и текстиль": [
        ("Спецодежда", "general", "комплект", "Летний / зимний"),
    ],
    "Медицина и фармацевтика": [
        ("Медрасходники", "general", "уп", "Оптовая поставка"),
    ],
    "Химия и сырьё": [
        ("Промышленная химия", "general", "кг", "По ТЗ"),
    ],
    "Безопасность и охрана": [
        ("Видеонаблюдение", "general", "комплект", "Монтаж под ключ"),
    ],
    "Клининг и хозяйственные товары": [
        ("Клининг офиса", "general", "м²", "Регулярная уборка"),
    ],
    "Канцтовары": [
        ("Офисный набор", "general", "уп", "Бумага A4 и расходники"),
    ],
    "Реклама и полиграфия": [
        ("Печать баннеров", "general", "м²", "Широкоформатная печать"),
    ],
    "Образование и обучение": [
        ("Корпоративный тренинг", "general", "час", "Очное / онлайн"),
    ],
    "Консалтинг": [
        ("Бизнес-консалтинг", "general", "час", "Аудит и рекомендации"),
    ],
    "Юридические услуги": [
        ("Юридическое сопровождение", "general", "мес", "Договорное сопровождение"),
    ],
    "Финансовые услуги": [
        ("Бухгалтерское обслуживание", "general", "мес", "Аутсорс бухгалтерии"),
    ],
    "Энергетика": [
        ("Электромонтаж", "general", "объект", "Силовые сети"),
    ],
    "Нефть и газ": [
        ("Нефтесервис", "general", "услуга", "По проекту"),
    ],
    "Металлургия": [
        ("Металлопрокат", "general", "т", "Оптовые поставки"),
    ],
    "Услуги": [
        ("Комплексная услуга", "general", "услуга", "По согласованию"),
    ],
    "Другое": [
        ("Прочая позиция", "general", "шт", "Уточняется в заявке"),
    ],
}


def build_templates(catalog_cats):
    """Стабильные шаблоны товаров (без supplier) — для выбора при добавлении."""
    sub_name = {}
    for cat in catalog_cats:
        for sub in cat.get("subcategories") or []:
            sub_name[sub["id"]] = sub["name"]
    templates = []
    for cat_name, rows in PRODUCT_TEMPLATES.items():
        for name, sub_id, unit, desc in rows:
            slug = (
                f"{cat_name}-{sub_id}-{name}"
                .lower()
                .replace(" ", "-")
                .replace("/", "-")
                .replace('"', "")
            )
            # простой стабильный id
            tid = "tpl-" + "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in slug)[:80]
            templates.append(
                {
                    "id": tid,
                    "name": name,
                    "category": cat_name,
                    "subcategory_id": sub_id,
                    "subcategory": sub_name.get(sub_id, sub_id),
                    "unit": unit,
                    "description": desc,
                    "image_url": "/static/img/catalog-placeholder.svg",
                }
            )
    # unique by id
    seen = set()
    unique = []
    for t in templates:
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        unique.append(t)
    return unique


def main():
    users = json.loads(USERS_FILE.read_text(encoding="utf-8")) if USERS_FILE.exists() else []
    suppliers_by_cat = {}
    for u in users:
        if u.get("role") != "supplier":
            continue
        cats = (u.get("supplier") or {}).get("categories") or []
        if not cats:
            cat = (u.get("supplier") or {}).get("category") or ""
            cats = [cat] if cat else []
        for cat in cats:
            suppliers_by_cat.setdefault(cat, []).append(u)

    products = []
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sub_name = {}
    for cat in CATALOG:
        for sub in cat["subcategories"]:
            sub_name[sub["id"]] = sub["name"]

    templates = build_templates(CATALOG)

    for cat_name, rows in PRODUCT_TEMPLATES.items():
        suppliers = suppliers_by_cat.get(cat_name) or []
        for i, (name, sub_id, unit, desc) in enumerate(rows):
            supplier = suppliers[i % len(suppliers)] if suppliers else None
            products.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "category": cat_name,
                    "subcategory_id": sub_id,
                    "subcategory": sub_name.get(sub_id, sub_id),
                    "unit": unit,
                    "description": desc,
                    "image_url": "/static/img/catalog-placeholder.svg",
                    "supplier_id": supplier["id"] if supplier else None,
                    "supplier_name": (supplier.get("supplier") or {}).get("company_name")
                    if supplier
                    else "",
                    "created_at": now,
                }
            )

    category_names = [c["name"] for c in CATALOG]
    data = {
        "categories": CATALOG,
        "category_names": category_names,
        "templates": templates,
        "products": products,
    }
    CATALOG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"categories={len(CATALOG)} templates={len(templates)} products={len(products)} -> {CATALOG_FILE}"
    )


if __name__ == "__main__":
    main()
