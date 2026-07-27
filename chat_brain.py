"""Разбор закупки для HupHup: текст → категории → поставщики.

Публичный API для app.py: analyze_request, compose_final_text,
match_suppliers_for_analysis. Индекс каталога из того же источника, что и app
(SQLite при USE_SQLITE=1, иначе data/catalog.json).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import db as db_store

CATALOG_FILE = Path(__file__).parent / "data" / "catalog.json"

# --- Лексиконы категорий / товаров ---

CATEGORY_KEYWORDS = {
    "Строительство": [
        "строител", "постро", "генподряд", "фундамент", "монолит", "каркас",
        "дорожн", "инфраструктур", "здание", "объект", "коттедж", "склад постро",
    ],
    "Ремонт и отделка": [
        "ремонт", "отделк", "штукатур", "покраск", "плитк", "интерьер",
        "чистовая", "обои", "ламинат", "натяжн",
    ],
    "Стройматериалы": [
        "цемент", "кирпич", "бетон", "арматур", "гипсокартон", "утеплител",
        "кровл", "стройматериал", "песок", "щебень", "блок", "дерев", "брус",
        "доск", "фанер", "пиломатериал", "рейк", "вагонк", "осб", "дсп", "мдф",
        "гвозд", "саморез", "краск", "грунт",
    ],
    "Оборудование": [
        "оборудован", "станок", "инструмент", "генератор", "компрессор",
    ],
    "Промышленное оборудование": [
        "промышленн", "производственн", "заводск", "конвейер", "автоматизац",
    ],
    "Электротехника": [
        "электр", "кабел", "провод", "щит", "розетк", "светильник", "ламп",
        "трансформатор", "удлинител",
    ],
    "IT и ПО": [
        "сайт", "программ", "софт", "разработк", "разработчик", "программист",
        "crm", "erp", "приложение", "айти", "веб", "мобильн", "облачн",
        "сервер", "senior", "middle", "junior", "frontend", "backend",
        "fullstack", "devops", "тестировщик", "дизайнер", "ux", "ui",
        "python", "react", "java", "nodejs", "flutter",
    ],
    "Оргтехника и компьютеры": [
        "компьютер", "ноутбук", "принтер", "мфу", "монитор", "оргтехник", "пк",
    ],
    "Телекоммуникации": [
        "интернет", "роутер", "телефон", "связь", "оптоволокн", "телеком", "wifi",
    ],
    "Продукты питания": [
        "продукт", "еда", "питан", "молоч", "мясо", "хлеб", "бакале", "напитк",
        "овощ", "фрукт", "кофе", "чай",
    ],
    "Сельское хозяйство": [
        "агро", "сельхоз", "семена", "удобрен", "корм", "теплиц", "ферм",
    ],
    "Транспорт": [
        "транспорт", "перевозк", "грузовик", "автопарк", "фура", "самосвал",
    ],
    "Логистика и доставка": [
        "логистик", "доставк", "склад", "курьер", "фулфилмент",
    ],
    "Автозапчасти": [
        "запчаст", "автозапчаст", "фильтр", "тормоз", "шины", "масло",
        "аккумулятор", "свеч", "амортизатор", "ремень", "колодк", "радиатор",
        "подшипник", "стартер", "генератор авто", "дворник",
    ],
    "Мебель": [
        "мебел", "стол", "стул", "кресл", "шкаф", "диван", "тумб", "стеллаж",
        "офисн мебел", "парта", "кровать", "комод", "полк", "мягк мебел",
    ],
    "Одежда и текстиль": [
        "одежд", "текстил", "спецодежд", "ткан", "униформ", "халат",
        "куртк", "брюк", "футболк", "полотенц", "постельн",
    ],
    "Медицина и фармацевтика": [
        "медицин", "лекарств", "фарм", "клиник", "аптек", "медоборуд",
        "шприц", "бинт", "антисептик", "маск медицин", "перчатк медицин",
        "тонометр", "анализатор", "расходник медицин",
    ],
    "Химия и сырьё": [
        "хими", "сырь", "реагент", "полимер", "кислот", "растворител",
        "краск промышлен", "смол", "катализатор",
    ],
    "Безопасность и охрана": [
        "охран", "безопасн", "видеонаблюд", "сигнализац", "камер",
        "доступ контроль", "пожарная", "охранное", "тревожн", "домофон",
    ],
    "Клининг и хозяйственные товары": [
        "клининг", "уборк", "хозтовар", "моющее", "дезинфекц", "пылесос",
        "тряпк", "ведро", "быт хими", "санитар", "клинингов",
    ],
    "Канцтовары": [
        "канц", "бумаг", "ручка", "тетрад", "папк", "скотч", "степлер",
        "маркер", "кнопк канц", "конверт", "бланк", "офисн принадлеж",
    ],
    "Реклама и полиграфия": [
        "реклам", "полиграф", "печат", "баннер", "брендинг", "листовк",
        "визитник", "вывеск", "наклейк", "смм", "наружн реклам",
    ],
    "Образование и обучение": [
        "обучен", "курс", "тренинг", "образован", "семинар", "вебинар",
        "корпоративн обучен", "повышение квалиф",
    ],
    "Консалтинг": [
        "консалтинг", "консультац", "стратег", "бизнес анализ", "оптимизац",
        "внедрен процесс", "управленческ", "аудиторск консалт",
    ],
    "Юридические услуги": [
        "юридич", "юрист", "адвокат", "договор", "правов", "регистрац тоо",
        "претенз", "судебн", "нотариус",
    ],
    "Финансовые услуги": [
        "бухгалтер", "аудит", "налог", "финанс", "зарплат", "1с бухгал",
        "отчётность", "кассовый",
    ],
    "Энергетика": [
        "энерг", "солнечн", "виэ", "электростанц", "трансформатор",
        "подстанц", "солнечн панель",
    ],
    "Нефть и газ": [
        "нефть", "нефте", "скважин", "газопровод", "буров", "нпз",
    ],
    "Металлургия": [
        "металл", "сталь", "труб", "прокат", "алюмин", "арматур сталь",
        "швеллер", "уголок", "лист металла",
    ],
    "Услуги": [
        "услуг", "сервис", "аутсорсинг", "сопровожден", "монтаж", "пусконалад",
    ],
}

# Каталог товаров: синоним -> шаблон понимания
PRODUCTS = [
    {
        "id": "concrete",
        "name": "бетон",
        "category": "Стройматериалы",
        "synonyms": ["бетон", "бетона", "бетоном", "раствор бетон"],
        "needs": ["марка_бетона", "город", "доставка"],
        "unit_default": "т",
    },
    {
        "id": "cement",
        "name": "цемент",
        "category": "Стройматериалы",
        "synonyms": ["цемент", "цемента"],
        "needs": ["марка_цемента", "город", "доставка"],
        "unit_default": "т",
    },
    {
        "id": "brick",
        "name": "кирпич",
        "category": "Стройматериалы",
        "synonyms": ["кирпич", "кирпича", "кирпичей"],
        "needs": ["тип_кирпича", "город"],
        "unit_default": "шт",
    },
    {
        "id": "wood",
        "name": "пиломатериал",
        "category": "Стройматериалы",
        "synonyms": [
            "дерев", "дерево", "дерева", "брус", "бруса", "доск", "доска",
            "доски", "пиломатериал", "вагонк", "фанер", "рейк", "бревн",
        ],
        "needs": ["вид_дерева", "город", "доставка"],
        "unit_default": "шт",
    },
    {
        "id": "dev_senior",
        "name": "senior-разработчик",
        "category": "IT и ПО",
        "synonyms": ["senior разработчик", "senior developer", "сеньор", "синьор"],
        "needs": ["стек", "срок", "формат_работы"],
        "unit_default": "чел",
        "level": "senior",
    },
    {
        "id": "dev_middle",
        "name": "middle-разработчик",
        "category": "IT и ПО",
        "synonyms": ["middle разработчик", "middle developer", "мидл"],
        "needs": ["стек", "срок", "формат_работы"],
        "unit_default": "чел",
        "level": "middle",
    },
    {
        "id": "dev_junior",
        "name": "junior-разработчик",
        "category": "IT и ПО",
        "synonyms": ["junior разработчик", "junior developer", "джун", "джуниор"],
        "needs": ["стек", "срок", "формат_работы"],
        "unit_default": "чел",
        "level": "junior",
    },
    {
        "id": "developer",
        "name": "разработчик",
        "category": "IT и ПО",
        "synonyms": [
            "разработчик", "разработчика", "разработчиков", "программист",
            "программиста", "программистов", "developer", "айтишник",
        ],
        "needs": ["уровень", "стек", "срок", "формат_работы"],
        "unit_default": "чел",
    },
    {
        "id": "website",
        "name": "сайт / веб-разработка",
        "category": "IT и ПО",
        "synonyms": ["сайт", "лендинг", "веб-сайт", "интернет-магазин", "web"],
        "needs": ["стек", "срок"],
    },
    {
        "id": "crm",
        "name": "CRM / ПО",
        "category": "IT и ПО",
        "synonyms": ["crm", "erp", "софт", "программное обеспечение"],
        "needs": ["срок"],
    },
    {
        "id": "sand",
        "name": "песок",
        "category": "Стройматериалы",
        "synonyms": ["песок", "песка"],
        "needs": ["город", "доставка"],
        "unit_default": "т",
    },
    {
        "id": "rebar",
        "name": "арматура",
        "category": "Стройматериалы",
        "synonyms": ["арматур", "арматура"],
        "needs": ["город", "доставка"],
        "unit_default": "т",
    },
    {
        "id": "computer",
        "name": "компьютер / оргтехника",
        "category": "Оргтехника и компьютеры",
        "synonyms": [
            "компьютер", "компьютера", "компьютеров", "ноутбук", "ноутбука",
            "пк", "монитор", "принтер", "оргтехник", "системный блок",
        ],
        "needs": ["город"],
        "unit_default": "шт",
    },
    {
        "id": "furniture",
        "name": "мебель",
        "category": "Мебель",
        "synonyms": ["мебел", "стол", "стул", "кресл", "шкаф", "диван"],
        "needs": ["город"],
    },
    {
        "id": "transport",
        "name": "транспорт / перевозка",
        "category": "Транспорт",
        "synonyms": ["перевозк", "грузовик", "фура", "самосвал", "транспорт"],
        "needs": ["город", "срок"],
    },
]

QUESTION_BANK = {
    "город": {
        "id": "город",
        "text": "В каком городе нужна поставка или работа?",
        "options": ["Астана", "Алматы", "Шымкент", "Караганда", "Актобе", "Другой город"],
    },
    "доставка": {
        "id": "доставка",
        "text": "Нужна ли доставка на объект?",
        "options": ["Да, нужна", "Нет, самовывоз"],
    },
    "марка_бетона": {
        "id": "марка_бетона",
        "text": "Какая марка бетона нужна?",
        "options": ["М200", "М300", "М400", "М500", "Не важно"],
    },
    "марка_цемента": {
        "id": "марка_цемента",
        "text": "Какая марка цемента нужна?",
        "options": ["М400", "М500", "М600", "Не важно"],
    },
    "тип_кирпича": {
        "id": "тип_кирпича",
        "text": "Какой кирпич нужен?",
        "options": ["Керамический", "Силикатный", "Облицовочный", "Не важно"],
    },
    "вид_дерева": {
        "id": "вид_дерева",
        "text": "Какой пиломатериал нужен?",
        "options": ["Брус", "Доска", "Вагонка", "Фанера", "Не важно"],
    },
    "уровень": {
        "id": "уровень",
        "text": "Какой уровень разработчиков нужен?",
        "options": ["Junior", "Middle", "Senior", "Любой"],
    },
    "стек": {
        "id": "стек",
        "text": "Какой стек / технологии нужны?",
        "options": ["Python", "React", "Java", "Flutter", "1C", "Не важно"],
    },
    "срок": {
        "id": "срок",
        "text": "На какой срок это нужно?",
        "options": ["Срочно", "1 месяц", "3 месяца", "6 месяцев", "Разово"],
    },
    "формат_работы": {
        "id": "формат_работы",
        "text": "Какой формат работы?",
        "options": ["Удалённо", "Офис", "Гибрид"],
    },
}

# --- Города / стоп-слова / стеки ---
# Стем (нижний регистр) -> каноническое имя города (падежи RU).
CITY_STEMS = {
    "астан": "Астана",
    "алмат": "Алматы",
    "шымкент": "Шымкент",
    "шимкент": "Шымкент",
    "караганд": "Караганда",
    "актоб": "Актобе",
    "тараз": "Тараз",
    "павлодар": "Павлодар",
    "усть-каменогорск": "Усть-Каменогорск",
    "оскемен": "Усть-Каменогорск",
    "семей": "Семей",
    "атырау": "Атырау",
    "костанай": "Костанай",
    "кызылорд": "Кызылорда",
    "уральск": "Уральск",
    "орал": "Уральск",
    "петропавловск": "Петропавловск",
    "актау": "Актау",
    "туркестан": "Туркестан",
    "кокшетау": "Кокшетау",
    "талдыкорган": "Талдыкорган",
}

# Слабые / шумные ключевые слова категорий (ложные срабатывания)
CATEGORY_NEGATIVE = {
    "Логистика и доставка": ["с доставк", "нужна доставк", "доставк на объект"],
    "Услуги": [],
}

STOP_TOKENS = {
    "нужно", "нужен", "нужна", "нужны", "мне", "для", "шт", "штук", "штука",
    "тонна", "тонны", "тонну", "тонн", "метр", "метров", "по", "это", "или",
    "как", "хочу", "ищу", "заказать", "требуется", "пожалуйста", "есть",
    "город", "доставка", "самовывоз", "срочно", "месяц", "месяца", "месяцев",
}

STACKS = [
    "python", "django", "fastapi", "flask", "javascript", "typescript", "react",
    "vue", "angular", "node", "nodejs", "java", "spring", "csharp", "c#", ".net",
    "php", "laravel", "golang", "go", "rust", "flutter", "kotlin", "swift",
    "android", "ios", "devops", "docker", "kubernetes", "sql", "postgres",
    "mongodb", "1c", "битрикс",
]

UNIT_MAP = {
    "тонна": "т",
    "тонны": "т",
    "тонну": "т",
    "тонн": "т",
    "т": "т",
    "кг": "кг",
    "шт": "шт",
    "штук": "шт",
    "штука": "шт",
    "штуки": "шт",
    "метр": "м",
    "метра": "м",
    "метров": "м",
    "м": "м",
    "человек": "чел",
    "чел": "чел",
    "разработчик": "чел",
    "разработчика": "чел",
    "разработчиков": "чел",
}


# --- Нормализация текста ---


def normalize_text(text: str) -> str:
    t = (text or "").lower().replace("ё", "е")
    t = t.replace("сеньор", "senior").replace("синьор", "senior")
    t = t.replace("мидл", "middle").replace("джуниор", "junior").replace("джун", "junior")
    t = re.sub(r"\s+", " ", t).strip()
    return t


# Частые опечатки / кривые написания -> канонический токен
TYPO_MAP = {
    "разработик": "разработчик",
    "разработики": "разработчики",
    "разработиков": "разработчиков",
    "разработика": "разработчика",
    "разработчики": "разработчики",
    "разраб": "разработчик",
    "праграмист": "программист",
    "кампютер": "компьютер",
    "кампютеры": "компьютеры",
    "компютер": "компьютер",
    "компютеры": "компьютеры",
    "комп": "компьютер",
    "ноут": "ноутбук",
    "офисный": "офисный",
    "офисные": "офисные",
    "бетоны": "бетон",
    "бетоном": "бетоном",
    "цемин": "цемент",
    "кирпичы": "кирпич",
}


def fix_typos(text: str) -> str:
    t = normalize_text(text)
    # Разделители не трогаем, правим только буквенные токены
    tokens = re.findall(r"[a-zа-я0-9]+|[^a-zа-я0-9]+", t, flags=re.I)
    out = []
    for tok in tokens:
        if re.fullmatch(r"[a-zа-я0-9]+", tok, flags=re.I):
            if tok in TYPO_MAP:
                out.append(TYPO_MAP[tok])
            else:
                corrected = fuzzy_correct_word(tok) if len(tok) >= 5 else None
                out.append(corrected if corrected else tok)
        else:
            out.append(tok)
    return "".join(out)


def fuzzy_correct_word(word: str) -> str | None:
    """Исправить близкие опечатки важных товарных слов."""
    targets = [
        "разработчик", "разработчики", "разработчиков", "программист",
        "компьютер", "компьютеры", "ноутбук", "бетон", "цемент", "кирпич",
        "пиломатериал", "мебель",
    ]
    best = None
    best_score = 0.0
    for target in targets:
        score = _similarity(word, target)
        if score > best_score:
            best_score = score
            best = target
    if best_score >= 0.72:
        return best
    return None


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 0.9
    # simple bigram Dice coefficient
    def bigrams(s):
        return {s[i : i + 2] for i in range(len(s) - 1)} or {s}

    ba, bb = bigrams(a), bigrams(b)
    inter = len(ba & bb)
    return (2 * inter) / (len(ba) + len(bb))


# --- Общие факты / город ---


def extract_global_facts(text: str) -> dict[str, str]:
    t = fix_typos(text)
    facts: dict[str, str] = {}

    city = detect_city(t)
    if city:
        facts["город"] = city

    grade = re.search(r"\bм\s*-?\s*(\d{2,3})\b", t, re.I)
    if grade and ("бетон" in t or "цемент" in t):
        mark = f"М{grade.group(1)}"
        if "бетон" in t:
            facts["марка_бетона"] = mark
        if "цемент" in t:
            facts["марка_цемента"] = mark

    found_stacks = [s for s in STACKS if re.search(rf"\b{re.escape(s)}\b", t, re.I)]
    if found_stacks:
        facts["стек"] = ", ".join(dict.fromkeys(found_stacks))

    if re.search(r"удал[её]нн|remote", t):
        facts["формат_работы"] = "удалённо"
    elif re.search(r"гибрид", t):
        facts["формат_работы"] = "гибрид"
    elif re.search(r"(?:^|[^\w])(?:в\s+)?офисе?(?:[^\w]|$)", t) and "офисн" not in t:
        facts["формат_работы"] = "офис"

    term = re.search(
        r"на\s+(\d+)\s*(день|дня|дней|недел[яию]|месяц(?:а|ев)?|год(?:а|ов)?)",
        t,
    )
    if term:
        facts["срок"] = f"{term.group(1)} {term.group(2)}"
    elif re.search(r"\bсрочно\b", t):
        facts["срок"] = "срочно"
    elif re.search(r"разов[ао]", t):
        facts["срок"] = "разово"

    if re.search(r"с доставк|нужна доставк|доставк[ау] на", t):
        facts["доставка"] = "да"
    elif re.search(r"без доставк|самовывоз", t):
        facts["доставка"] = "нет, самовывоз"

    if "брус" in t:
        facts["вид_дерева"] = "брус"
    elif "доск" in t:
        facts["вид_дерева"] = "доска"
    elif "вагонк" in t:
        facts["вид_дерева"] = "вагонка"
    elif "фанер" in t:
        facts["вид_дерева"] = "фанера"

    return facts


def detect_city(text: str) -> str:
    t = normalize_text(text)
    # Сначала более длинные стемы (усть-каменогорск раньше коротких)
    for stem in sorted(CITY_STEMS.keys(), key=len, reverse=True):
        if re.search(rf"(?:^|[^\w]){re.escape(stem)}[а-я]*", t):
            return CITY_STEMS[stem]
    return ""


# --- Индекс каталога (тот же источник, что у app) ---


def load_catalog_index() -> dict[str, Any]:
    """Загрузить товары для матча по имени; при SQLite — из БД."""
    data: dict[str, Any] = {"categories": [], "products": []}
    if db_store.use_sqlite():
        try:
            db_store.ensure_migrated()
            data = db_store.load_catalog() or data
        except (OSError, RuntimeError, ValueError):
            data = {"categories": [], "products": []}
    if not data.get("products") and CATALOG_FILE.exists():
        try:
            data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {"categories": [], "products": []}
    products = data.get("products") or []
    by_name = {}
    for p in products:
        key = normalize_text(p.get("name") or "")
        if key:
            by_name[key] = p
    return {"products": products, "by_name": by_name}


_CATALOG_INDEX: dict[str, Any] | None = None


def invalidate_catalog_index():
    """Сбросить кэш индекса после записи каталога в app."""
    global _CATALOG_INDEX
    _CATALOG_INDEX = None


def get_catalog_index() -> dict[str, Any]:
    global _CATALOG_INDEX
    if _CATALOG_INDEX is None:
        _CATALOG_INDEX = load_catalog_index()
    return _CATALOG_INDEX


def match_catalog_product(part: str) -> dict[str, Any] | None:
    """Точный / частичный матч по названиям товаров каталога."""
    t = fix_typos(part)
    t_norm = normalize_text(t)
    index = get_catalog_index()
    best = None
    best_score = 0
    for product in index["products"]:
        name = normalize_text(product.get("name") or "")
        if not name:
            continue
        score = 0
        if name == t_norm or name in t_norm or t_norm in name:
            score = 120 + len(name)
        else:
            name_tokens = [
                w for w in re.findall(r"[a-zа-я0-9]{3,}", name) if w not in STOP_TOKENS
            ]
            if not name_tokens:
                continue
            hits = sum(1 for w in name_tokens if w in t_norm)
            ratio = hits / len(name_tokens)
            if hits and ratio >= 0.5:
                score = 45 + hits * 12 + int(ratio * 20) + sum(
                    len(w) for w in name_tokens if w in t_norm
                )
            elif hits:
                score = 30 + hits * 8
        if score > best_score:
            best_score = score
            best = product
    if best_score >= 35:
        return best
    return None


# --- Разбор позиций заявки ---


def split_request_parts(text: str) -> list[str]:
    cleaned = fix_typos(text).strip()
    if not cleaned:
        return []
    cleaned = re.sub(
        r"^(мне\s+)?(нужно|нужен|нужна|нужны|хочу|требуется|ищу|заказать)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    protected = cleaned
    holders: list[str] = []

    def protect(match):
        holders.append(match.group(0))
        return f"__P{len(holders)-1}__"

    protected = re.sub(r"по\s+\d+(?:[.,]\d+)?\s*(?:метр(?:а|ов)?|м\b)?", protect, protected, flags=re.I)
    protected = re.sub(r"на\s+\d+\s*(?:день|дня|дней|недел[яию]|месяц(?:а|ев)?|год(?:а|ов)?)", protect, protected, flags=re.I)
    protected = re.sub(r"\bм\s*-?\s*\d{2,3}\b", protect, protected, flags=re.I)

    # Режем только когда после слова товара начинается НОВАЯ qty-first позиция:
    # e.g. "бетона 5 тонн цемента" — NOT "брус 100 штук"
    product_hint = (
        r"(?:бетон|цемент|кирпич|дерев|брус|доск|фанер|арматур|песок|щебень|"
        r"компьютер|ноутбук|принтер|мебел|стол|стул|сайт|crm|erp|"
        r"разработ|программ|senior|middle|junior|перевоз|грузовик|фура|"
        r"утеплител|кабел|провод)"
    )
    protected = re.sub(
        rf"(?<=[а-яa-z0-9])\s+(?=\d+(?:[.,]\d+)?\s+(?:тонн[аыу]?|т\b|шт(?:ук[аи]?)?|кг|метр(?:а|ов)?|м\b|чел\.?)\s+{product_hint})",
        " | ",
        protected,
        flags=re.I,
    )
    # Также режем цепочки qty-first: "10 тонн бетона 5 тонн цемента"
    protected = re.sub(
        rf"(?<=[а-яa-z])\s+(?=\d+(?:[.,]\d+)?\s+(?:тонн[аыу]?|т\b|шт(?:ук[аи]?)?|кг|senior|middle|junior)\s*{product_hint})",
        " | ",
        protected,
        flags=re.I,
    )

    parts = re.split(r"[,;\n|]+|\s+и\s+", protected, flags=re.IGNORECASE)

    restored = []
    for p in parts:
        chunk = p.strip(" .")
        if not chunk:
            continue
        for i, val in enumerate(holders):
            chunk = chunk.replace(f"__P{i}__", val)
        if re.fullmatch(r"\d+\s*(день|дня|дней|недел[яию]|месяц(?:а|ев)?|год(?:а|ов)?)", chunk, flags=re.I):
            continue
        restored.append(chunk)

    # Re-attach orphan "5 шт" / "2 тонны" fragments to previous product part
    merged: list[str] = []
    qty_only = re.compile(
        r"^\d+(?:[.,]\d+)?\s*(?:шт|штук[аи]?|т|тонн[аыу]?|м|метр(?:а|ов)?|кг|чел\.?)?(?:\s+[а-яa-z]+)?$",
        flags=re.I,
    )
    for chunk in restored:
        if merged and qty_only.match(chunk) and not detect_product(chunk):
            # city-only leftovers like "5 шт алматы" — keep qty with previous, city stays in global facts
            qty_bit = re.match(
                r"^(\d+(?:[.,]\d+)?\s*(?:шт|штук[аи]?|т|тонн[аыу]?|м|метр(?:а|ов)?|кг|чел\.?)?)",
                chunk,
                flags=re.I,
            )
            if qty_bit:
                merged[-1] = f"{merged[-1]} {qty_bit.group(1)}".strip()
            continue
        if re.fullmatch(
            r"\d+(?:[.,]\d+)?\s*(?:шт|штук[аи]?|т|тонн[аыу]?|м|метр(?:а|ов)?|кг)?",
            chunk,
            flags=re.I,
        ):
            if merged:
                merged[-1] = f"{merged[-1]} {chunk}".strip()
            continue
        merged.append(chunk)

    return merged or [fix_typos(text).strip()]


def detect_product(part: str) -> dict[str, Any] | None:
    t = fix_typos(part)

    if re.search(r"\b(senior|middle|junior)\b", t) and re.search(r"разработ|программист|developer", t):
        level = re.search(r"\b(senior|middle|junior)\b", t).group(1)
        for product in PRODUCTS:
            if product.get("level") == level:
                return product

    # fuzzy / stem match for developer & computer even with leftovers
    if re.search(r"разработ|программист|developer|айтишн", t):
        for product in PRODUCTS:
            if product["id"] == "developer":
                return product
    if re.search(r"компьютер|ноутбук|\bпк\b|оргтехник|монитор|принтер", t):
        for product in PRODUCTS:
            if product["id"] == "computer":
                return product

    best = None
    best_score = 0
    for product in PRODUCTS:
        for syn in product["synonyms"]:
            if syn not in t:
                continue
            # Предпочитаем более длинные / близкие к границам слов матчи
            score = len(syn) * 2
            if re.search(rf"(?:^|[^\w]){re.escape(syn)}", t):
                score += 5
            if product["id"] == "developer" and any(x in t for x in ("senior", "middle", "junior")):
                continue
            if score > best_score:
                best = product
                best_score = score
    return best


def parse_qty_unit(part: str, product: dict[str, Any] | None) -> tuple[str, str]:
    t = normalize_text(part)
    # Убрать марку вроде м300, чтобы не считать её количеством
    t = re.sub(r"\bм\s*-?\s*\d{2,3}\b", " ", t)
    m = re.search(
        r"(\d+(?:[.,]\d+)?)\s*"
        r"(тонн[аыу]?|т\b|шт(?:ук[аи]?)?|метр(?:а|ов)?|м\b|кг|"
        r"человек|чел\.?|разработчик(?:а|ов)?|senior|middle|junior)?",
        t,
        flags=re.I,
    )
    if not m:
        return "", product.get("unit_default", "") if product else ""
    qty = m.group(1).replace(",", ".")
    raw_unit = (m.group(2) or "").strip().lower()
    if raw_unit in ("senior", "middle", "junior", "разработчик", "разработчика", "разработчиков"):
        unit = "чел"
    else:
        unit = UNIT_MAP.get(raw_unit, raw_unit or (product or {}).get("unit_default", ""))
    return qty, unit


def parse_size(part: str) -> str:
    t = normalize_text(part)
    m = re.search(r"по\s+(\d+(?:[.,]\d+)?)\s*(метр(?:а|ов)?|м\b)?", t)
    if m:
        return f"{m.group(1)} м" if m.group(2) else m.group(1)
    m = re.search(r"(\d+)\s*[xх]\s*(\d+)(?:\s*[xх]\s*(\d+))?", t)
    if m:
        dims = [m.group(1), m.group(2)] + ([m.group(3)] if m.group(3) else [])
        return "x".join(dims)
    return ""


# --- Оценка категорий ---


def score_categories(text: str) -> dict[str, int]:
    text_l = normalize_text(text)
    scores: dict[str, int] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in text_l:
                score += 2 if len(kw) > 4 else 1
        if category.lower() in text_l:
            score += 4
        # Штраф логистике, если «доставка» — только условие поставки товара
        if category in CATEGORY_NEGATIVE:
            for neg in CATEGORY_NEGATIVE[category]:
                if neg in text_l:
                    score -= 3
        if score > 0:
            scores[category] = score
    return scores


def detect_categories(text: str, limit: int = 8) -> list[str]:
    ranked = sorted(score_categories(text).items(), key=lambda x: x[1], reverse=True)
    return [cat for cat, _ in ranked[:limit]]


def parse_item(part: str, global_facts: dict[str, str] | None = None) -> dict[str, Any]:
    global_facts = global_facts or {}
    part = fix_typos(part)
    product = detect_product(part)
    catalog_hit = match_catalog_product(part)
    qty, unit = parse_qty_unit(part, product)
    size = parse_size(part)

    if product:
        category = product["category"]
        name = product["name"]
        missing = list(product.get("needs", []))
        confidence = 0.9
        attrs: dict[str, Any] = {"product_id": product["id"]}
        if product.get("level"):
            attrs["уровень"] = product["level"]
            if "уровень" in missing:
                missing.remove("уровень")
        if catalog_hit:
            attrs["catalog_product_id"] = catalog_hit.get("id")
            attrs["subcategory"] = catalog_hit.get("subcategory") or ""
            attrs["subcategory_id"] = catalog_hit.get("subcategory_id") or ""
            if catalog_hit.get("supplier_id"):
                attrs["preferred_supplier_id"] = catalog_hit["supplier_id"]
            # Предпочитаем более точное название из каталога при явном матче
            cat_name = catalog_hit.get("name") or ""
            if cat_name and normalize_text(cat_name) in normalize_text(part):
                name = cat_name
                confidence = 0.96
            if catalog_hit.get("unit") and not unit:
                unit = catalog_hit["unit"]
    elif catalog_hit:
        category = catalog_hit.get("category") or ""
        name = catalog_hit.get("name") or part.strip()
        missing = ["город"]
        confidence = 0.88
        attrs = {
            "catalog_product_id": catalog_hit.get("id"),
            "subcategory": catalog_hit.get("subcategory") or "",
            "subcategory_id": catalog_hit.get("subcategory_id") or "",
        }
        if catalog_hit.get("supplier_id"):
            attrs["preferred_supplier_id"] = catalog_hit["supplier_id"]
        if catalog_hit.get("unit") and not unit:
            unit = catalog_hit["unit"]
    else:
        cats = detect_categories(part, limit=1)
        category = cats[0] if cats else ""
        name = part.strip()
        missing = ["город"]
        confidence = 0.55 if category else 0.25
        attrs = {}

    # Убрать вопросы, на которые уже есть ответ в тексте/фактах
    missing = [m for m in missing if m not in global_facts]
    if qty:
        confidence = min(0.98, confidence + 0.05)
    if size:
        confidence = min(0.98, confidence + 0.03)
        attrs["размер"] = size

    # Ключевые слова для ранжирования поставщиков
    attrs["keywords"] = extract_item_keywords(part, name, product)

    return {
        "raw": part,
        "name": name,
        "qty": qty,
        "unit": unit,
        "size": size,
        "category": category,
        "confidence": round(confidence, 2),
        "missing": missing,
        "attrs": attrs,
    }


def extract_item_keywords(part: str, name: str, product: dict | None) -> list[str]:
    words = re.findall(r"[a-zа-я0-9]{3,}", normalize_text(f"{part} {name}"))
    keys = []
    for w in words:
        if w in STOP_TOKENS or w.isdigit():
            continue
        if w not in keys:
            keys.append(w)
    if product:
        for syn in product.get("synonyms", []):
            token = normalize_text(syn).split()[0]
            if len(token) >= 3 and token not in keys:
                keys.append(token)
    return keys[:12]


# --- Уточняющие вопросы / краткое резюме ---


def build_questions(items: list[dict], answers: dict[str, str], facts: dict[str, str]) -> list[dict]:
    known = {**facts, **answers}
    needed: list[str] = []
    for item in items:
        for key in item.get("missing", []):
            if key == "уточнение":
                continue
            if key not in needed and key not in known:
                needed.append(key)

    remote = normalize_text(known.get("формат_работы", "")).startswith("удал")
    solid = any(i.get("confidence", 0) >= 0.85 and i.get("category") for i in items)
    if solid and not remote and "город" not in known and "город" not in needed:
        needed.insert(0, "город")
    if remote:
        needed = [k for k in needed if k != "город"]

    # Неоднозначная заявка: нет твёрдого товара, несколько близких категорий
    if not solid and "категория" not in known:
        ranked = sorted(
            score_categories(" ".join(i.get("raw", "") for i in items)).items(),
            key=lambda x: -x[1],
        )
        if len(ranked) >= 2 and ranked[0][1] > 0 and ranked[0][1] - ranked[1][1] <= 2:
            needed.insert(0, "категория")

    questions = []
    for key in needed:
        if key == "категория":
            ranked = sorted(
                score_categories(" ".join(i.get("raw", "") for i in items)).items(),
                key=lambda x: -x[1],
            )
            options = [c for c, _ in ranked[:4]] or [
                "Стройматериалы",
                "IT и ПО",
                "Мебель",
                "Другое",
            ]
            questions.append(
                {
                    "id": "категория",
                    "text": "К какой категории ближе ваш запрос?",
                    "options": options,
                }
            )
            continue
        q = QUESTION_BANK.get(key)
        if q:
            questions.append(dict(q))
    return questions[:6]


def human_summary(items: list[dict], categories: list[str], facts: dict[str, str], answers: dict[str, str]) -> str:
    known = {**facts, **answers}
    bits = []
    for item in items:
        piece = item["name"]
        if item.get("qty"):
            piece = f"{item['qty']} {item.get('unit', '')} {piece}".strip()
        if item.get("size"):
            piece += f" по {item['size']}"
        if item.get("category"):
            piece += f" [{item['category']}]"
        bits.append(piece)

    summary = "Я понял ваш запрос так: " + "; ".join(bits) if bits else "Пока не удалось понять позиции"
    if categories:
        summary += f". Категории поставщиков: {', '.join(categories)}"
    extras = []
    labels = {
        "город": "город",
        "марка_бетона": "марка бетона",
        "марка_цемента": "марка цемента",
        "вид_дерева": "пиломатериал",
        "стек": "стек",
        "срок": "срок",
        "формат_работы": "формат",
        "доставка": "доставка",
        "уровень": "уровень",
        "категория": "категория",
    }
    for key, label in labels.items():
        if known.get(key):
            extras.append(f"{label}: {known[key]}")
    if extras:
        summary += ". Уже учтено: " + ", ".join(extras)
    return summary


# --- Публично: разбор заявки ---


def analyze_request(text: str, answers: dict | None = None) -> dict[str, Any]:
    """Разобрать текст закупки на позиции, категории, факты и вопросы."""
    answers = {k: str(v).strip() for k, v in (answers or {}).items() if str(v).strip()}
    facts = extract_global_facts(text)
    if answers.get("категория"):
        facts["категория"] = answers["категория"]

    parts = split_request_parts(text)
    items = [parse_item(p, facts) for p in parts]

    cleaned_items = []
    for i in items:
        if not i["name"] or len(i["raw"]) <= 1:
            continue
        if not i.get("category") and i.get("confidence", 0) < 0.5:
            continue
        if re.fullmatch(
            r"\d+(?:[.,]\d+)?\s*(?:шт|штук[аи]?|т|тонн[аыу]?|м|метр(?:а|ов)?|кг)?",
            i["raw"].strip(),
            flags=re.I,
        ):
            continue
        cleaned_items.append(i)
    items = cleaned_items
    if not items:
        items = [parse_item(fix_typos(text), facts)]
        items = [i for i in items if i.get("category") or i.get("confidence", 0) >= 0.5]

    if answers.get("категория"):
        for item in items:
            if item.get("confidence", 0) < 0.85 or not item.get("category"):
                item["category"] = answers["категория"]
                item["confidence"] = max(item.get("confidence", 0), 0.8)

    categories: list[str] = []
    for item in items:
        if item["category"] and item["category"] not in categories:
            categories.append(item["category"])

    solid = any(i.get("confidence", 0) >= 0.85 and i.get("category") for i in items)
    if not categories:
        if answers.get("категория"):
            categories = [answers["категория"]]
        else:
            categories = detect_categories(text, limit=3)
    elif not solid:
        for cat, score in sorted(score_categories(text).items(), key=lambda x: x[1], reverse=True):
            if cat in categories or score < 5:
                continue
            if cat == "Логистика и доставка":
                continue
            categories.append(cat)
            break
    # Надёжный матч товара: оставляем только категории позиций

    merged: list[dict] = []
    for item in items:
        if (
            merged
            and merged[-1]["name"] == item["name"]
            and merged[-1]["category"] == item["category"]
            and not item.get("qty")
            and not merged[-1].get("qty")
        ):
            continue
        merged.append(item)
    items = merged

    questions = build_questions(items, answers, facts)
    avg_conf = sum(i["confidence"] for i in items) / max(len(items), 1)
    known = {**facts, **answers}

    return {
        "items": items,
        "categories": categories,
        "summary": human_summary(items, categories, facts, answers),
        "questions": questions,
        "needs_clarification": len(questions) > 0,
        "confidence": round(avg_conf, 2),
        "answers": known,
        "facts": facts,
    }


# --- Матчинг поставщиков ---


def _supplier_haystack(supplier: dict) -> str:
    cats = supplier.get("categories")
    if isinstance(cats, list):
        cat_text = " ".join(str(c) for c in cats)
    else:
        cat_text = supplier.get("category") or ""
    return normalize_text(
        " ".join(
            [
                supplier.get("company_name") or "",
                cat_text,
                supplier.get("description") or "",
                supplier.get("city") or "",
            ]
        )
    )


def _supplier_cats(supplier: dict) -> list[str]:
    cats = supplier.get("categories")
    if isinstance(cats, list) and cats:
        return [str(c) for c in cats if c]
    cat = supplier.get("category") or ""
    return [cat] if cat else []


def score_supplier_for_items(
    supplier: dict, items: list[dict], categories: list[str], city: str
) -> int:
    """Оценка, насколько поставщик подходит под разобранные позиции."""
    cats = _supplier_cats(supplier)
    overlap = [c for c in cats if c in categories] if categories else cats
    if categories and not overlap:
        return -1

    score = 0
    for cat in overlap:
        idx = categories.index(cat) if cat in categories else 99
        score += 50 + max(0, 8 - idx) * 4

    hay = _supplier_haystack(supplier)
    city_l = normalize_text(city)
    if city_l and city_l[:4] in hay:
        score += 18

    cat_set = set(cats)
    for item in items:
        item_cat = item.get("category")
        if item_cat and item_cat not in cat_set:
            continue
        score += 8
        attrs = item.get("attrs") or {}
        if attrs.get("preferred_supplier_id") and attrs["preferred_supplier_id"] == supplier.get(
            "id"
        ):
            score += 30
        for kw in attrs.get("keywords") or []:
            if len(kw) >= 3 and kw in hay:
                score += 3
        name = normalize_text(item.get("name") or "")
        for token in re.findall(r"[a-zа-я0-9]{4,}", name):
            if token in hay:
                score += 4
        sub = normalize_text(attrs.get("subcategory") or "")
        if sub and any(tok in hay for tok in sub.split() if len(tok) >= 4):
            score += 6

    return score


def match_suppliers_for_analysis(
    analysis: dict,
    suppliers: list[dict],
    limit: int = 16,
    per_category: int = 6,
) -> tuple[list[str], str, list[dict]]:
    """
    Выбрать наиболее релевантных поставщиков для разобранной заявки.
    `suppliers` — список публичных словарей поставщиков.
    """
    categories = list(analysis.get("categories") or [])
    items = analysis.get("items") or []
    known = analysis.get("answers") or analysis.get("facts") or {}
    city = known.get("город") or ""

    if not categories:
        categories = detect_categories(
            " ".join(i.get("raw", "") for i in items) or analysis.get("summary") or "",
            limit=3,
        )

    scored: list[tuple[int, dict]] = []
    for supplier in suppliers:
        score = score_supplier_for_items(supplier, items, categories, city)
        if score >= 0:
            scored.append((score, supplier))

    scored.sort(key=lambda x: x[0], reverse=True)

    picked: list[dict] = []
    seen: set[str] = set()
    per_cat_count: dict[str, int] = {c: 0 for c in categories}

    for score, supplier in scored:
        cats = _supplier_cats(supplier)
        sid = supplier.get("id")
        if not sid or sid in seen:
            continue
        # считаем лимит по первой пересекающейся категории заявки
        primary = next((c for c in cats if c in per_cat_count), cats[0] if cats else "")
        if primary in per_cat_count and per_cat_count[primary] >= per_category:
            continue
        row = dict(supplier)
        row["match_score"] = score
        picked.append(row)
        seen.add(sid)
        if primary in per_cat_count:
            per_cat_count[primary] += 1
        if len(picked) >= limit:
            break

    have = set()
    for s in picked:
        have.update(_supplier_cats(s))
    for cat in categories:
        if cat in have:
            continue
        for supplier in suppliers:
            if cat in _supplier_cats(supplier) and supplier.get("id") not in seen:
                row = dict(supplier)
                row["match_score"] = score_supplier_for_items(
                    supplier, items, categories, city
                )
                picked.append(row)
                seen.add(supplier["id"])
                have.add(cat)
                break

    if categories:
        summary = "Подобраны поставщики по категориям: " + ", ".join(categories)
    else:
        summary = "Категория не определена точно"

    return categories, summary, picked[:limit]


# --- Публично: итоговый текст заявки ---


def compose_final_text(text: str, answers: dict | None = None) -> str:
    """Добавить структурированные ответы уточнений к исходному тексту."""
    answers = answers or {}
    labels = {
        "город": "Город",
        "доставка": "Доставка",
        "марка_бетона": "Марка бетона",
        "марка_цемента": "Марка цемента",
        "тип_кирпича": "Тип кирпича",
        "вид_дерева": "Пиломатериал",
        "уровень": "Уровень",
        "стек": "Стек",
        "срок": "Срок",
        "формат_работы": "Формат работы",
        "категория": "Категория",
        "уточнение": "Уточнение",
    }
    extras = [f"{label}: {answers[key]}" for key, label in labels.items() if answers.get(key)]
    if not extras:
        return text
    return text.strip() + "\n\nУточнения: " + "; ".join(extras)
