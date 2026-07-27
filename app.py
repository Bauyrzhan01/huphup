"""Flask-приложение HupHup: auth, каталог, заявки/офферы, уведомления, рейтинги.

Хранилище: по умолчанию SQLite (db.py); USE_SQLITE=0 — JSON в data/.
Мутации API требуют CSRF (X-CSRF-Token) и общий in-memory rate limit.
"""
from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for,
    send_file,
    send_from_directory,
)
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path
from functools import wraps
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from jinja2 import ChoiceLoader, FileSystemLoader
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import time
import uuid

try:
    import fcntl
except ImportError:  # Windows — модуля нет
    fcntl = None

from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from chat_brain import (
    analyze_request,
    compose_final_text,
    match_suppliers_for_analysis,
)
from i18n import (
    SUPPORTED,
    bundle_for,
    i18n as i18n_service,
    normalize_lang,
    translate,
    translate_dynamic,
)
import db as db_store
from mailer import send_mail, smtp_configured

# --- Конфиг приложения / безопасность ---

app = Flask(__name__)

# Admin UI lives in admin_panel/ (separate templates + static)
import admin_panel as admin_panel_pkg

_APP_TEMPLATES = Path(__file__).resolve().parent / "templates"
app.jinja_loader = ChoiceLoader(
    [
        FileSystemLoader(str(_APP_TEMPLATES)),
        FileSystemLoader(str(admin_panel_pkg.TEMPLATES)),
    ]
)

_DEFAULT_SECRET = "tenderbauka-dev-secret-change-me"
app.secret_key = (
    os.environ.get("FLASK_SECRET_KEY") or os.environ.get("SECRET_KEY") or _DEFAULT_SECRET
)
IS_PRODUCTION = os.environ.get("FLASK_ENV") == "production" or os.environ.get("PRODUCTION") == "1"
ON_VERCEL = bool(os.environ.get("VERCEL"))
ALLOW_DEV_CODE = (os.environ.get("ALLOW_DEV_CODE") or "").strip().lower() in (
    "1",
    "true",
    "yes",
)
if app.secret_key == _DEFAULT_SECRET and IS_PRODUCTION:
    raise RuntimeError("Set FLASK_SECRET_KEY before running in production")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=IS_PRODUCTION or ON_VERCEL,
)

# Простой in-memory rate limit (по IP) — держите 1 gunicorn worker
_RATE_BUCKETS: dict[str, list[float]] = {}
AUTH_RATE_LIMIT = 12
AUTH_RATE_WINDOW_SEC = 900
API_RATE_LIMIT = 90
API_RATE_WINDOW_SEC = 60
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"

# Код подтверждения email при регистрации (DB на Vercel/Neon; иначе in-memory)
_PENDING_REGISTRATIONS: dict[str, dict] = {}
EMAIL_VERIFY_TTL_SEC = 900
EMAIL_VERIFY_RESEND_SEC = 45


def _pending_get(email: str) -> dict | None:
    email = (email or "").strip().lower()
    if db_store.use_db():
        db_store.ensure_migrated()
        row = db_store.get_pending_registration(email)
        if not row:
            return None
        return {
            "code_digest": row["code_digest"],
            "user": row["user"],
            "expires_at": row["expires_at"],
            "sent_at": row["sent_at"],
            "attempts": row["attempts"],
        }
    return _PENDING_REGISTRATIONS.get(email)


def _pending_save(email: str, record: dict) -> None:
    email = (email or "").strip().lower()
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_pending_registration(
            email,
            code_digest=record["code_digest"],
            user=record["user"],
            expires_at=record["expires_at"],
            sent_at=record["sent_at"],
            attempts=int(record.get("attempts") or 0),
        )
        return
    _PENDING_REGISTRATIONS[email] = record


def _pending_delete(email: str) -> None:
    email = (email or "").strip().lower()
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.delete_pending_registration(email)
        return
    _PENDING_REGISTRATIONS.pop(email, None)


def _pending_update_attempts(email: str, attempts: int) -> None:
    email = (email or "").strip().lower()
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.update_pending_registration(email, attempts=attempts)
        return
    if email in _PENDING_REGISTRATIONS:
        _PENDING_REGISTRATIONS[email]["attempts"] = attempts


@app.context_processor
def inject_i18n():
    """Отдать _(), языковой бандл и csrf_token во все шаблоны."""
    lang = normalize_lang(session.get("lang"))
    return {
        "lang": lang,
        "langs": SUPPORTED,
        "i18n_mode": i18n_service.mode,
        "_": lambda key, **kwargs: translate(lang, key, **kwargs),
        "i18n_bundle": bundle_for(lang),
        "csrf_token": ensure_csrf_token(),
    }


def safe_redirect_url(target, fallback):
    """Защита от open redirect — только same-host absolute/relative URL."""
    if not target:
        return fallback
    try:
        ref = urlparse(target)
        if ref.scheme and ref.scheme not in ("http", "https"):
            return fallback
        if ref.netloc:
            host = request.host.split(":")[0]
            if ref.netloc.split(":")[0] != host:
                return fallback
        path = ref.path or "/"
        if ref.query:
            path = f"{path}?{ref.query}"
        return path
    except (ValueError, TypeError):
        return fallback


def check_rate_limit(bucket: str, limit: int, window_sec: int) -> bool:
    """False, если IP превысил `limit` запросов за `window_sec`."""
    ip = request.remote_addr or "unknown"
    key = f"{bucket}:{ip}"
    now = time.time()
    window_start = now - window_sec
    attempts = [t for t in _RATE_BUCKETS.get(key, []) if t >= window_start]
    if len(attempts) >= limit:
        _RATE_BUCKETS[key] = attempts
        return False
    attempts.append(now)
    _RATE_BUCKETS[key] = attempts
    return True


def check_auth_rate_limit():
    return check_rate_limit("auth", AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_SEC)


def ensure_csrf_token():
    """Создать или вернуть CSRF-секрет сессии для double-submit."""
    token = session.get("_csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf"] = token
    return token


def track_event(kind: str, *, path: str = "", meta: dict | None = None, visitor_id: str = ""):
    """Best-effort analytics event. Safe from any request path."""
    try:
        uid = session.get("user_id")
        user = find_user_by_id(uid) if uid else None
        db_store.record_analytics_event(
            kind,
            path=path or (request.path if request else ""),
            user_id=(user or {}).get("id") or (uid or ""),
            role=(user or {}).get("role") or session.get("role") or "",
            visitor_id=visitor_id or "",
            meta=meta,
        )
    except Exception:
        return


@app.before_request
def enforce_api_guards():
    """Rate-limit и CSRF-проверка для мутирующих вызовов /api/*."""
    if not request.path.startswith("/api/"):
        return None
    # Presence pulse: GET/POST without CSRF (beacon-friendly)
    if request.path == "/api/analytics/pulse":
        if not check_rate_limit("analytics_pulse", 120, 60):
            return jsonify({"ok": False, "error": "rate"}), 429
        return None
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        if not check_rate_limit("api_mut", API_RATE_LIMIT, API_RATE_WINDOW_SEC):
            return jsonify({"ok": False, "error": "Слишком много запросов"}), 429
        token = session.get("_csrf")
        sent = request.headers.get(CSRF_HEADER) or request.headers.get("X-CSRFToken")
        cookie = request.cookies.get(CSRF_COOKIE)
        if not token:
            token = ensure_csrf_token()
        if not sent or sent != token or (cookie and cookie != token):
            return jsonify({"ok": False, "error": "CSRF token missing or invalid"}), 403
    return None


@app.after_request
def set_csrf_cookie(response):
    """Продублировать CSRF сессии в cookie (JS) и заголовок ответа."""
    token = ensure_csrf_token()
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=False,
        samesite="Lax",
        secure=IS_PRODUCTION or ON_VERCEL,
        path="/",
    )
    response.headers[CSRF_HEADER] = token
    return response


# --- Языковые маршруты ---


@app.route("/lang/<code>")
def set_lang(code):
    session["lang"] = normalize_lang(code)
    nxt = (request.args.get("next") or "").strip()
    if nxt == "profile":
        user = current_user()
        if user and user.get("role") == "supplier":
            return redirect(url_for("dashboard") + "#profile")
        if user:
            return redirect(url_for("home") + "#profile")
    ref = request.headers.get("Referer") or url_for("index")
    return redirect(safe_redirect_url(ref, url_for("index")))


@app.route("/api/lang", methods=["POST"])
def api_set_lang():
    data = request.get_json(silent=True) or {}
    session["lang"] = normalize_lang(data.get("lang") or request.args.get("lang"))
    return jsonify(
        {
            "ok": True,
            "lang": session["lang"],
            "mode": i18n_service.mode,
            "bundle": bundle_for(session["lang"]),
        }
    )


@app.route("/api/i18n/translate", methods=["POST"])
def api_i18n_translate():
    """Хук свободного MT. В catalog-режиме текст без изменений (заготовка под API)."""
    data = request.get_json(silent=True) or {}
    text = data.get("text") or ""
    target = normalize_lang(data.get("target") or session.get("lang"))
    source = data.get("source")
    out = translate_dynamic(text, target, source)
    return jsonify(
        {
            "ok": True,
            "text": out,
            "target": target,
            "mode": i18n_service.mode,
            "mt": i18n_service.mode == "api",
        }
    )


# --- Пути к данным / доменные константы ---

_PACKAGE_ROOT = Path(__file__).resolve().parent
_RUNTIME_ROOT = Path("/tmp/huphup") if ON_VERCEL else _PACKAGE_ROOT
DATA_DIR = _PACKAGE_ROOT / "data"
USERS_FILE = DATA_DIR / "users.json"
REQUESTS_FILE = DATA_DIR / "requests.json"
CATALOG_FILE = DATA_DIR / "catalog.json"
NOTIFICATIONS_FILE = DATA_DIR / "notifications.json"
RATINGS_FILE = DATA_DIR / "ratings.json"
UPLOAD_DIR = (_RUNTIME_ROOT / "data" / "uploads") if ON_VERCEL else (DATA_DIR / "uploads")
PRODUCT_IMG_DIR = _RUNTIME_ROOT / "static" / "uploads" / "products"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOAD_EXT = frozenset({"pdf", "png", "jpg", "jpeg", "webp"})
ALLOWED_PRODUCT_IMAGE_EXT = frozenset({"png", "jpg", "jpeg", "webp"})
ALLOWED_UPLOAD_MIME = frozenset(
    {"application/pdf", "image/png", "image/jpeg", "image/webp"}
)
ALLOWED_PRODUCT_IMAGE_MIME = frozenset(
    {"image/png", "image/jpeg", "image/webp"}
)
MAX_PRODUCT_IMAGES = 8
CATALOG_PLACEHOLDER = "/static/img/catalog-placeholder.svg"

SUPPLIER_KEYS = [
    "company_name",
    "bin",
    "legal_address",
    "actual_address",
    "phone",
    "contact_person",
    "bank_name",
    "iban",
    "bik",
    "category",
    "description",
    "website",
    "years_on_market",
]

STOCK_STATUS_OPTIONS = {
    "in_stock": "В наличии",
    "on_order": "Под заказ",
}

CATEGORY_OPTIONS = [
    "Строительство",
    "Ремонт и отделка",
    "Стройматериалы",
    "Оборудование",
    "Промышленное оборудование",
    "Электротехника",
    "IT и ПО",
    "Оргтехника и компьютеры",
    "Телекоммуникации",
    "Продукты питания",
    "Сельское хозяйство",
    "Транспорт",
    "Логистика и доставка",
    "Автозапчасти",
    "Мебель",
    "Одежда и текстиль",
    "Медицина и фармацевтика",
    "Химия и сырьё",
    "Безопасность и охрана",
    "Клининг и хозяйственные товары",
    "Канцтовары",
    "Реклама и полиграфия",
    "Образование и обучение",
    "Консалтинг",
    "Юридические услуги",
    "Финансовые услуги",
    "Энергетика",
    "Нефть и газ",
    "Металлургия",
    "Услуги",
    "Другое",
]

# Поставщик должен ответить ценой в этом окне, иначе заявка для него скрывается
OFFER_DEADLINE_HOURS = 5
# Внутреннее напоминание, когда осталось меньше стольких секунд
DEADLINE_REMIND_SECONDS = 3600


# --- Время / дедлайн оффера ---


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value):
    if not value:
        return None
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def request_expires_at(item):
    """Datetime истечения окна ответа поставщика."""
    explicit = parse_iso(item.get("expires_at"))
    if explicit:
        return explicit
    created = parse_iso(item.get("created_at"))
    if not created:
        return None
    return created + timedelta(hours=OFFER_DEADLINE_HOURS)


def ensure_request_expiry(item):
    """Проставить expires_at, если его нет (старые заявки)."""
    if item.get("expires_at"):
        return item.get("expires_at")
    exp = request_expires_at(item)
    if exp:
        item["expires_at"] = exp.isoformat().replace("+00:00", "Z")
    return item.get("expires_at")


def supplier_has_offer(item, supplier_id):
    return any(o.get("supplier_id") == supplier_id for o in (item.get("offers") or []))


def supplier_can_see_request(item, supplier_id):
    """После дедлайна без оффера заявка пропадает для этого поставщика."""
    if supplier_id not in (item.get("supplier_ids") or []):
        return False
    status = item.get("status") or "sent"
    if status == "cancelled":
        return supplier_has_offer(item, supplier_id)
    if status in ("deal", "completed"):
        # Видна, только если есть оффер / участник сделки
        return supplier_has_offer(item, supplier_id)
    if supplier_has_offer(item, supplier_id):
        return True
    exp = request_expires_at(item)
    if not exp:
        return True
    return datetime.now(timezone.utc) < exp


def maybe_deadline_reminders():
    """Один раз уведомить (и при необходимости написать) поставщиков перед дедлайном."""
    items = load_requests()
    changed = False
    for item in items:
        if (item.get("status") or "sent") != "sent":
            continue
        if item.get("deadline_reminded"):
            continue
        info = offer_deadline_info(item)
        left = info.get("seconds_left")
        if left is None or left <= 0 or left > DEADLINE_REMIND_SECONDS:
            continue
        hours = OFFER_DEADLINE_HOURS
        mins = max(1, left // 60)
        short = (item.get("text") or "")[:80]
        for sid in item.get("supplier_ids") or []:
            if supplier_has_offer(item, sid):
                continue
            title = f"Осталось ~{mins} мин на ответ"
            body = f"Заявка сгорит через {mins} мин (окно {hours} ч): {short}"
            for uid in team_member_ids(sid):
                add_notification(
                    uid,
                    "deadline_reminder",
                    title,
                    body,
                    request_id=item.get("id"),
                )
                email_user(uid, title, body, request_id=item.get("id"))
        item["deadline_reminded"] = True
        changed = True
    if changed:
        save_requests(items)


def offer_deadline_info(item):
    exp = request_expires_at(item)
    if not exp:
        return {
            "expires_at": None,
            "seconds_left": None,
            "offer_expired": False,
            "deadline_hours": OFFER_DEADLINE_HOURS,
        }
    now = datetime.now(timezone.utc)
    seconds = int((exp - now).total_seconds())
    return {
        "expires_at": exp.isoformat().replace("+00:00", "Z"),
        "seconds_left": max(0, seconds),
        "offer_expired": seconds <= 0,
        "deadline_hours": OFFER_DEADLINE_HOURS,
    }


# --- Фасад хранилища (SQLite или JSON с flock) ---


def _flock(f, exclusive=False):
    """POSIX flock; на Windows no-op (fcntl отсутствует)."""
    if fcntl is None:
        return
    fcntl.flock(f.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)


def _funlock(f):
    if fcntl is None:
        return
    fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def load_json(path, default):
    """Чтение JSON под shared flock (режим USE_SQLITE=0)."""
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8") as f:
            _flock(f, exclusive=False)
            try:
                return json.load(f)
            finally:
                _funlock(f)
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path, data):
    """Атомарная запись JSON с exclusive flock (режим USE_SQLITE=0)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        _flock(f, exclusive=True)
        try:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        finally:
            _funlock(f)
    tmp.replace(path)


def load_catalog():
    """Загрузить каталог из SQLite или catalog.json; дополнить список категорий."""
    if db_store.use_db():
        db_store.ensure_migrated()
        catalog = db_store.load_catalog()
    else:
        catalog = load_json(CATALOG_FILE, {"categories": [], "products": []})
    return ensure_catalog_categories(catalog)


def ensure_catalog_categories(catalog):
    """Убедиться, что каждая категория поставщика есть в дереве каталога."""
    if not isinstance(catalog, dict):
        catalog = {"categories": [], "products": [], "templates": []}
    cats = catalog.setdefault("categories", [])
    products = catalog.setdefault("products", [])
    templates = catalog.setdefault("templates", [])
    by_name = {c.get("name"): c for c in cats if c.get("name")}
    changed = False

    for name in CATEGORY_OPTIONS:
        if name in by_name:
            entry = by_name[name]
            if not entry.get("subcategories"):
                entry["subcategories"] = [{"id": "general", "name": "Общее"}]
                changed = True
            continue
        slug = re.sub(r"[^a-z0-9а-яё]+", "_", name.lower()).strip("_") or "cat"
        cats.append(
            {
                "id": slug,
                "name": name,
                "subcategories": [{"id": "general", "name": "Общее"}],
            }
        )
        changed = True

    if not templates:
        try:
            from scripts.seed_catalog import build_templates, CATALOG as SEED_CATS

            catalog["templates"] = build_templates(cats or SEED_CATS)
            changed = True
        except Exception:
            pass

    catalog["categories"] = cats
    catalog["products"] = products
    catalog.setdefault("templates", catalog.get("templates") or [])
    if changed:
        save_catalog(catalog)
    return catalog


def save_catalog(data):
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_catalog(data)
    else:
        save_json(CATALOG_FILE, data)
    try:
        from chat_brain import invalidate_catalog_index

        invalidate_catalog_index()
    except Exception:
        pass


def load_users():
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.load_users()
    return load_json(USERS_FILE, [])


def save_users(users):
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_users(users)
    else:
        save_json(USERS_FILE, users)


def load_requests():
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.load_requests()
    return load_json(REQUESTS_FILE, [])


def save_requests(items):
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_requests(items)
    else:
        save_json(REQUESTS_FILE, items)


def save_request(item):
    """Persist a single request without full-collection rewrite."""
    if not item or not item.get("id"):
        return
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.upsert_request(item)
        return
    items = load_requests()
    rid = item["id"]
    for i, r in enumerate(items):
        if r.get("id") == rid:
            items[i] = item
            save_requests(items)
            return
    items.append(item)
    save_requests(items)


def load_notifications():
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.load_notifications()
    return load_json(NOTIFICATIONS_FILE, [])


def save_notifications(items):
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_notifications(items)
    else:
        save_json(NOTIFICATIONS_FILE, items)


# --- Уведомления / почта / рейтинги ---


def add_notification(user_id, ntype, title, body="", request_id=None):
    if not user_id:
        return None
    items = load_notifications()
    note = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body or "",
        "request_id": request_id,
        "read": False,
        "created_at": now_iso(),
    }
    items.append(note)
    # Ограничить размер списка уведомлений
    if len(items) > 2000:
        items = items[-2000:]
    save_notifications(items)
    return note


EMAIL_NOTIFY_TYPES = frozenset({"new_request", "new_offer", "deadline_reminder"})


def notify_many(user_ids, ntype, title, body="", request_id=None):
    seen = set()
    for uid in user_ids or []:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        add_notification(uid, ntype, title, body, request_id)
        if ntype in EMAIL_NOTIFY_TYPES:
            email_user(uid, title, body or title, request_id=request_id)


def app_base_url() -> str:
    """Базовый URL сайта из APP_BASE_URL (без хвостового /)."""
    return (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")


def app_url(path: str = "/") -> str:
    """Собрать абсолютную ссылку для писем и уведомлений."""
    base = app_base_url()
    p = path if path.startswith("/") else f"/{path}"
    return f"{base}{p}" if base else p


def detect_lan_ip() -> str:
    """Локальный Wi‑Fi IP (для ссылок, которыми делятся с телефона)."""
    import socket

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return ""


def shareable_base_url() -> str:
    """URL, доступный с других устройств в той же сети (не 127.0.0.1)."""
    base = app_base_url()
    if base and "127.0.0.1" not in base and "localhost" not in base.lower():
        return base

    host_url = ""
    try:
        host_url = (request.host_url or "").rstrip("/")
    except RuntimeError:
        host_url = ""

    if host_url and "127.0.0.1" not in host_url and "localhost" not in host_url.lower():
        return host_url

    lan = detect_lan_ip()
    port = "5000"
    try:
        if request.host and ":" in request.host:
            port = request.host.rsplit(":", 1)[-1]
        else:
            port = str(request.environ.get("SERVER_PORT") or os.environ.get("FLASK_PORT") or "5000")
    except RuntimeError:
        port = str(os.environ.get("FLASK_PORT") or "5000")

    if lan:
        return f"http://{lan}:{port}"
    return host_url or f"http://127.0.0.1:{port}"


def shareable_url(path: str = "/") -> str:
    p = path if path.startswith("/") else f"/{path}"
    return f"{shareable_base_url()}{p}"


def load_ratings():
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.load_ratings()
    return load_json(RATINGS_FILE, [])


def save_ratings(items):
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.save_ratings(items)
    else:
        save_json(RATINGS_FILE, items)


def email_user(user_id, subject, body, request_id=None):
    """SMTP-письмо при настроенных SMTP_*; иначе no-op."""
    _ = request_id  # зарезервировано для будущих deep-link на заявку
    if not smtp_configured() or not user_id:
        return
    u = find_user_by_id(user_id)
    if not u or not u.get("email"):
        return
    full_body = body
    if app_base_url():
        link_path = "/dashboard" if u.get("role") == "supplier" else "/home"
        full_body = f"{body}\n\nОткрыть: {app_url(link_path)}"
    send_mail(u["email"], subject, full_body)


def build_email_body(text: str, user_id: str | None = None) -> str:
    """Текст письма со ссылкой по роли получателя."""
    if not app_base_url() or not user_id:
        return text
    u = find_user_by_id(user_id)
    if not u:
        return text
    link_path = "/dashboard" if u.get("role") == "supplier" else "/home"
    return f"{text}\n\nОткрыть: {app_url(link_path)}"


# --- Вложения в чате сделки ---


def _upload_meta_path(file_id: str) -> Path:
    return UPLOAD_DIR / f"{file_id}.meta.json"


def _load_upload_meta(file_id: str) -> dict | None:
    path = _upload_meta_path(file_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_upload_meta(meta: dict) -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    _upload_meta_path(meta["id"]).write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8"
    )


def _allowed_upload(filename: str, mime: str) -> bool:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        return False
    if mime and mime not in ALLOWED_UPLOAD_MIME:
        guess, _ = mimetypes.guess_type(filename)
        if guess and guess not in ALLOWED_UPLOAD_MIME:
            return False
    return True


def _normalize_product_image_url(url: str):
    """Разрешить placeholder, /static/img/… или загруженные фото поставщика."""
    value = (url or "").strip()
    if not value:
        return ""
    if value == CATALOG_PLACEHOLDER:
        return value
    if value.startswith("/static/img/"):
        name = value[len("/static/img/") :]
        if not name or "/" in name or "\\" in name or ".." in name:
            return None
        return f"/static/img/{name}"
    prefix = "/static/uploads/products/"
    if not value.startswith(prefix):
        return None
    name = value[len(prefix) :]
    if not name or "/" in name or "\\" in name or ".." in name:
        return None
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_PRODUCT_IMAGE_EXT:
        return None
    return f"{prefix}{name}"


def product_image_list(product):
    """Список фото товара (image_urls или устаревший image_url)."""
    if not product:
        return []
    urls = product.get("image_urls")
    out = []
    seen = set()
    if isinstance(urls, list):
        for raw in urls:
            n = _normalize_product_image_url(raw if isinstance(raw, str) else "")
            if n and n not in seen and n != CATALOG_PLACEHOLDER:
                seen.add(n)
                out.append(n)
    if not out:
        single = _normalize_product_image_url(product.get("image_url") or "")
        if single and single != CATALOG_PLACEHOLDER:
            out.append(single)
    return out


def _sync_product_cover(product):
    """image_url = первое фото (для старого UI каталога)."""
    urls = product_image_list(product)
    if urls:
        product["image_urls"] = urls
        product["image_url"] = urls[0]
    else:
        product.pop("image_urls", None)
        product.pop("image_url", None)


def _apply_product_images(product, data, fallback_urls=None):
    """Поставить список фото поставщика; иначе fallback."""
    fallback_urls = [u for u in (fallback_urls or []) if u]

    if "image_urls" in data or "image_url" in data:
        raw_list = data.get("image_urls")
        if raw_list is None and "image_url" in data:
            single = data.get("image_url")
            raw_list = [single] if single else []
        if not isinstance(raw_list, list):
            return "Некорректный список фото"
        cleaned = []
        seen = set()
        for raw in raw_list:
            n = _normalize_product_image_url(raw if isinstance(raw, str) else "")
            if n is None:
                return "Некорректное фото товара"
            if not n or n == CATALOG_PLACEHOLDER or n in seen:
                continue
            seen.add(n)
            cleaned.append(n)
            if len(cleaned) >= MAX_PRODUCT_IMAGES:
                break
        if cleaned:
            product["image_urls"] = cleaned
            product["image_url"] = cleaned[0]
        else:
            product.pop("image_urls", None)
            product.pop("image_url", None)
        return None

    if fallback_urls:
        product["image_urls"] = fallback_urls[:MAX_PRODUCT_IMAGES]
        product["image_url"] = fallback_urls[0]
    else:
        _sync_product_cover(product)
    return None


def can_access_upload(file_id: str, user) -> bool:
    """Доступ к файлу только для сторон сделки по заявке."""
    meta = _load_upload_meta(file_id)
    if not meta or not user:
        return False
    _items, _index, target = find_request(meta.get("request_id") or "")
    if not target:
        return False
    return can_access_deal(target, user)


def rating_stats_map(ratings=None):
    """Средняя оценка и число отзывов по id пользователя."""
    ratings = ratings if ratings is not None else load_ratings()
    buckets = {}
    for r in ratings:
        tid = r.get("to_user_id")
        score = r.get("score")
        if not tid or not isinstance(score, (int, float)):
            continue
        b = buckets.setdefault(tid, {"sum": 0.0, "count": 0})
        b["sum"] += float(score)
        b["count"] += 1
    out = {}
    for tid, b in buckets.items():
        if b["count"] <= 0:
            continue
        out[tid] = {
            "rating_avg": round(b["sum"] / b["count"], 1),
            "rating_count": b["count"],
        }
    return out


def find_rating(request_id, from_user_id, ratings=None):
    ratings = ratings if ratings is not None else load_ratings()
    for r in ratings:
        if r.get("request_id") == request_id and r.get("from_user_id") == from_user_id:
            return r
    return None


# --- Пользователи / поставщики ---


def find_user_by_email(email):
    email = (email or "").strip().lower()
    if not email:
        return None
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.get_user_by_email(email)
    for user in load_users():
        if (user.get("email") or "").lower() == email:
            return user
    return None


def find_user_by_id(user_id):
    if not user_id:
        return None
    if db_store.use_db():
        db_store.ensure_migrated()
        return db_store.get_user_by_id(user_id)
    for user in load_users():
        if user.get("id") == user_id:
            return user
    return None


def save_user(user):
    """Persist a single user without rewriting the whole collection."""
    if not user or not user.get("id"):
        return
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.upsert_user(user)
        return
    users, index = find_user_index(user["id"])
    if index >= 0:
        users[index] = user
    else:
        users.append(user)
    save_users(users)


def find_user_index(user_id):
    users = load_users()
    for i, user in enumerate(users):
        if user["id"] == user_id:
            return users, i
    return users, -1


def empty_supplier():
    return {key: "" for key in SUPPLIER_KEYS}


def supplier_categories(supplier):
    """Список категорий; поддерживает старое поле `category`."""
    s = supplier or {}
    cats = s.get("categories")
    if isinstance(cats, list):
        out = [str(c).strip() for c in cats if str(c).strip()]
        if out:
            return list(dict.fromkeys(out))
    cat = str(s.get("category") or "").strip()
    return [cat] if cat else []


def ensure_company_category(user, category: str) -> None:
    """Добавить категорию в профиль компании (owner), если её ещё нет."""
    category = (category or "").strip()
    if not category or category not in CATEGORY_OPTIONS:
        return
    owner = company_user(user)
    if not owner:
        return
    users, index = find_user_index(owner["id"])
    if index < 0:
        return
    supplier = dict(users[index].get("supplier") or empty_supplier())
    cats = supplier_categories(supplier)
    if category in cats:
        return
    cats = list(dict.fromkeys([*cats, category]))
    supplier["categories"] = cats
    supplier["category"] = cats[0]
    # preserve other keys
    prev = users[index].get("supplier") or {}
    for key in ("offer_templates",):
        if key in prev and key not in supplier:
            supplier[key] = prev[key]
    users[index]["supplier"] = {**prev, **supplier}
    save_users(users)


def pick_supplier(data, base=None):
    supplier = empty_supplier() if base is None else {**empty_supplier(), **base}
    for key in SUPPLIER_KEYS:
        if key in data and data[key] is not None and key != "category":
            supplier[key] = str(data[key]).strip()

    raw_cats = data.get("categories")
    if raw_cats is None and "category" in data:
        raw_cats = data.get("category")
    cats = []
    if isinstance(raw_cats, list):
        cats = [str(c).strip() for c in raw_cats if str(c).strip()]
    elif isinstance(raw_cats, str) and raw_cats.strip():
        # через запятую или одно значение
        cats = [c.strip() for c in raw_cats.split(",") if c.strip()]
    cats = [c for c in cats if c in CATEGORY_OPTIONS]
    cats = list(dict.fromkeys(cats))
    if cats:
        supplier["categories"] = cats
        supplier["category"] = cats[0]
    elif base is not None:
        # оставить текущие, если не передали
        existing = supplier_categories(supplier)
        if existing:
            supplier["categories"] = existing
            supplier["category"] = existing[0]
    return supplier


def login_required(view):
    """Редирект анонимов на /login для HTML-страниц."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        user = current_user()
        if not user or user.get("blocked"):
            session.clear()
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def api_login_required(view):
    """401 JSON для анонимных вызовов API."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"ok": False, "error": "Нужна авторизация"}), 401
        user = current_user()
        if not user or user.get("blocked"):
            session.clear()
            return jsonify({"ok": False, "error": "Аккаунт заблокирован"}), 403
        return view(*args, **kwargs)

    return wrapped


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    user = find_user_by_id(user_id)
    if not user:
        return None
    return {k: v for k, v in user.items() if k != "password"}


# --- Команда поставщика: owner + managers ---

INVITE_TTL_SEC = 7 * 24 * 3600


def supplier_role_of(user) -> str:
    """owner | manager | '' — старые аккаунты без поля = owner."""
    if not user or user.get("role") != "supplier":
        return ""
    role = (user.get("supplier_role") or "").strip().lower()
    if role == "manager":
        return "manager"
    return "owner"


def is_supplier_owner(user) -> bool:
    return supplier_role_of(user) == "owner"


def is_supplier_manager(user) -> bool:
    return supplier_role_of(user) == "manager"


def company_id(user):
    """ID компании (= id владельца) для matching / offers / products."""
    if not user or user.get("role") != "supplier":
        return None
    if is_supplier_manager(user):
        cid = (user.get("company_supplier_id") or "").strip()
        return cid or None
    return user.get("id")


def company_user(user):
    """Запись владельца компании для сотрудника."""
    cid = company_id(user)
    if not cid:
        return None
    if user.get("id") == cid:
        return user
    return find_user_by_id(cid)


def company_supplier_profile(user) -> dict:
    owner = company_user(user)
    if not owner:
        return {}
    s = owner.get("supplier")
    return s if isinstance(s, dict) else {}


def can_act_as_company(user, target_company_id) -> bool:
    if not user or user.get("blocked"):
        return False
    return company_id(user) == target_company_id


def is_matchable_supplier(user) -> bool:
    """В матчинг попадают только владельцы (не менеджеры)."""
    return (
        bool(user)
        and user.get("role") == "supplier"
        and not user.get("blocked")
        and supplier_role_of(user) == "owner"
    )


def team_member_ids(company_supplier_id: str) -> list:
    """Owner + активные менеджеры компании (для уведомлений)."""
    if not company_supplier_id:
        return []
    ids = []
    for u in load_users():
        if u.get("blocked") or u.get("role") != "supplier":
            continue
        if u.get("id") == company_supplier_id and supplier_role_of(u) == "owner":
            ids.append(u["id"])
        elif (
            supplier_role_of(u) == "manager"
            and (u.get("company_supplier_id") or "") == company_supplier_id
        ):
            ids.append(u["id"])
    return list(dict.fromkeys(ids))


PRESENCE_ONLINE_SECONDS = 120


def touch_user_presence(user_id: str) -> None:
    """Обновить last_seen_at для онлайн-статуса."""
    if not user_id:
        return
    user = find_user_by_id(user_id)
    if not user:
        return
    user["last_seen_at"] = now_iso()
    save_user(user)


def is_user_online(user) -> bool:
    if not user:
        return False
    seen = parse_iso(user.get("last_seen_at") or "")
    if not seen:
        return False
    age = (datetime.now(timezone.utc) - seen).total_seconds()
    return 0 <= age <= PRESENCE_ONLINE_SECONDS


def member_active_deal_count(member_id: str, company_supplier_id: str, requests=None) -> int:
    """Сколько активных сделок ведёт сотрудник компании."""
    if not member_id or not company_supplier_id:
        return 0
    n = 0
    for r in requests if requests is not None else load_requests():
        if (r.get("status") or "") != "deal":
            continue
        offer = next(
            (o for o in (r.get("offers") or []) if o.get("id") == r.get("accepted_offer_id")),
            None,
        )
        if not offer or offer.get("supplier_id") != company_supplier_id:
            continue
        if offer.get("acted_by") == member_id:
            n += 1
            continue
        if any(
            (m.get("acted_by") or m.get("sender_id")) == member_id
            for m in (r.get("deal_messages") or [])
            if (m.get("role") or "") == "supplier"
        ):
            n += 1
    return n


def presence_payload(user, company_supplier_id=None, requests=None) -> dict:
    """online | offline | in_process для сотрудника."""
    cid = company_supplier_id or company_id(user)
    online = is_user_online(user)
    active = member_active_deal_count(user.get("id") if user else "", cid or "", requests)
    if active > 0:
        status = "in_process"
    elif online:
        status = "online"
    else:
        status = "offline"
    return {
        "presence": status,
        "online": online,
        "in_process": status == "in_process",
        "active_deals": active,
        "last_seen_at": (user or {}).get("last_seen_at") or "",
    }


def expand_company_notify_ids(company_ids) -> list:
    out = []
    for cid in company_ids or []:
        out.extend(team_member_ids(cid))
    return list(dict.fromkeys(out))


def actor_fields(user) -> dict:
    return {
        "acted_by": user.get("id"),
        "acted_by_name": user.get("name") or "",
        "acted_by_role": supplier_role_of(user) or "",
    }


def find_invite(token: str):
    """Найти владельца и запись invites[] по токену."""
    token = (token or "").strip()
    if not token:
        return None, None, -1
    for u in load_users():
        if not is_matchable_supplier(u):
            continue
        invites = u.get("invites")
        if not isinstance(invites, list):
            continue
        for i, inv in enumerate(invites):
            if not isinstance(inv, dict):
                continue
            if (inv.get("token") or "") == token:
                return u, inv, i
    return None, None, -1


def invite_is_valid(inv) -> bool:
    if not inv or inv.get("used_by"):
        return False
    exp = parse_iso(inv.get("expires_at"))
    if exp and datetime.now(timezone.utc) > exp:
        return False
    return True


def first_name(full_name):
    return (full_name or "").strip().split()[0] if full_name else ""


def avatar_initials(full_name):
    parts = [p for p in (full_name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def avatar_tone(full_name):
    h = 0
    for ch in full_name or "":
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % 5


def public_supplier(user, stats=None):
    """Публичная карточка компании (только owner / matchable)."""
    if is_supplier_manager(user):
        owner = company_user(user)
        if owner:
            user = owner
    s = user.get("supplier") or {}
    cats = supplier_categories(s)
    data = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "company_name": s.get("company_name") or "",
        "category": cats[0] if cats else "",
        "categories": cats,
        "phone": s.get("phone") or "",
        "description": s.get("description") or "",
        "city": (s.get("actual_address") or s.get("legal_address") or "").split(",")[0],
        "years_on_market": s.get("years_on_market") or "",
        "website": s.get("website") or "",
        "rating_avg": None,
        "rating_count": 0,
    }
    if stats is None:
        stats = rating_stats_map()
    info = stats.get(user["id"]) or {}
    data["rating_avg"] = info.get("rating_avg")
    data["rating_count"] = info.get("rating_count") or 0
    return data


def normalize_favorites(user):
    """Нормализовать избранное: { products: [id], suppliers: [id] }."""
    fav = user.get("favorites")
    if not isinstance(fav, dict):
        fav = {}
    products = fav.get("products")
    suppliers = fav.get("suppliers")
    if not isinstance(products, list):
        products = []
    if not isinstance(suppliers, list):
        suppliers = []
    # Убрать дубли, сохранив порядок
    products = list(dict.fromkeys(str(x) for x in products if x))
    suppliers = list(dict.fromkeys(str(x) for x in suppliers if x))
    return {"products": products, "suppliers": suppliers}


def public_product(product):
    if not product:
        return None
    row = {k: v for k, v in product.items() if k != "price"}
    urls = product_image_list(row)
    if urls:
        row["image_urls"] = urls
        row["image_url"] = urls[0]
    elif not row.get("image_url"):
        row["image_url"] = CATALOG_PLACEHOLDER
    return row


def resolve_favorites(user):
    fav = normalize_favorites(user)
    catalog = load_catalog()
    products_by_id = {p.get("id"): p for p in (catalog.get("products") or []) if p.get("id")}
    users_by_id = {u["id"]: u for u in load_users()}
    stats = rating_stats_map()

    products = []
    for pid in fav["products"]:
        p = products_by_id.get(pid)
        if p:
            products.append(public_product(p))

    suppliers = []
    for sid in fav["suppliers"]:
        u = users_by_id.get(sid)
        if u and is_matchable_supplier(u):
            suppliers.append(public_supplier(u, stats))

    return {
        "product_ids": fav["products"],
        "supplier_ids": fav["suppliers"],
        "products": products,
        "suppliers": suppliers,
    }


# --- Обогащение заявок / мост к матчингу ---


def match_suppliers_from_analysis(analysis, limit=16):
    """Загрузить живых поставщиков и оценить через chat_brain."""
    stats = rating_stats_map()
    suppliers = [
        public_supplier(u, stats)
        for u in load_users()
        if is_matchable_supplier(u)
    ]
    return match_suppliers_for_analysis(analysis, suppliers, limit=limit)


def sanitize_request_payload(payload, viewer):
    """Убрать внутренние поля перед отдачей заявок клиенту."""
    if not viewer or viewer.get("id") != payload.get("user_id"):
        payload.pop("user_email", None)
    return payload


def enrich_request(item, viewer):
    """Добавить публичных поставщиков, офферы, сторону сделки и флаги оценки для зрителя."""
    users_by_id = {u["id"]: u for u in load_users()}
    stats = rating_stats_map()
    ratings = load_ratings()
    suppliers = []
    for sid in item.get("supplier_ids", []):
        u = users_by_id.get(sid)
        if u:
            suppliers.append(public_supplier(u, stats))

    offers = []
    for offer in item.get("offers", []):
        u = users_by_id.get(offer["supplier_id"])
        company = ""
        rating_avg = None
        rating_count = 0
        if u:
            company = (u.get("supplier") or {}).get("company_name") or u.get("name")
            info = stats.get(u["id"]) or {}
            rating_avg = info.get("rating_avg")
            rating_count = info.get("rating_count") or 0
        offers.append(
            {
                **offer,
                "company_name": company,
                "rating_avg": rating_avg,
                "rating_count": rating_count,
            }
        )

    my_offer = None
    viewer_cid = company_id(viewer) if viewer else None
    if viewer and viewer["role"] == "supplier" and viewer_cid:
        for offer in offers:
            if offer["supplier_id"] == viewer_cid:
                my_offer = offer
                break

    request_items = item.get("items") or []
    details = item.get("details") or {}
    for_you = request_items

    if viewer and viewer.get("role") == "supplier":
        my_cats = set(supplier_categories(company_supplier_profile(viewer)))
        if my_cats:
            matched = [i for i in request_items if i.get("category") in my_cats]
            if matched:
                for_you = matched

    # Короткий текст для клиента без длинного дампа уточнений
    short_text = (item.get("text") or "").split("Уточнения:")[0].strip()

    accepted_offer = next(
        (o for o in offers if o["id"] == item.get("accepted_offer_id")),
        None,
    )
    accepted_supplier = None
    if accepted_offer:
        u = users_by_id.get(accepted_offer["supplier_id"])
        if u:
            accepted_supplier = public_supplier(u, stats)

    deal_partner_name = ""
    deal_partner_phone = ""
    deal_partner_email = ""
    if viewer and item.get("status") in ("deal", "completed"):
        if viewer["role"] == "user" and accepted_supplier:
            deal_partner_name = accepted_supplier.get("company_name") or accepted_supplier.get("name") or ""
            deal_partner_phone = accepted_supplier.get("phone") or ""
            deal_partner_email = accepted_supplier.get("email") or ""
        elif viewer["role"] == "supplier":
            deal_partner_name = item.get("user_name") or ""
            buyer = users_by_id.get(item.get("user_id"))
            if buyer:
                deal_partner_phone = buyer.get("phone") or ""
                deal_partner_email = buyer.get("email") or ""

    is_deal_party = False
    if viewer:
        if viewer["role"] == "user" and item.get("user_id") == viewer["id"]:
            is_deal_party = item.get("status") in ("deal", "completed") and bool(item.get("accepted_offer_id"))
        elif viewer["role"] == "supplier" and accepted_offer and viewer_cid:
            is_deal_party = accepted_offer.get("supplier_id") == viewer_cid

    deal_confirmations = [str(uid) for uid in (item.get("deal_confirmations") or []) if uid]
    viewer_id = str(viewer.get("id")) if viewer and viewer.get("id") else ""
    deal_confirmed_by_me = bool(viewer_id and viewer_id in deal_confirmations)
    deal_confirmed_by_other = False
    if viewer_id:
        deal_confirmed_by_other = any(uid != viewer_id for uid in deal_confirmations)

    my_rating = None
    can_rate = False
    rate_target_id = None
    rate_target_name = ""
    if viewer and is_deal_party and item.get("status") == "completed":
        my_rating = find_rating(item["id"], viewer["id"], ratings)
        if viewer["role"] == "user":
            rate_target_id = item.get("accepted_supplier_id")
            rate_target_name = deal_partner_name or "поставщика"
        else:
            rate_target_id = item.get("user_id")
            rate_target_name = item.get("user_name") or "покупателя"
        can_rate = bool(rate_target_id) and my_rating is None

    return sanitize_request_payload(
        {
            **item,
            "text": short_text,
            "suppliers": suppliers,
            "offers": offers,
            "offers_count": len(offers),
            "my_offer": my_offer,
            "for_you": for_you,
            "details": details,
            "deal_messages": item.get("deal_messages") or [],
            "accepted_offer": accepted_offer,
            "accepted_supplier": accepted_supplier,
            "deal_partner_name": deal_partner_name,
            "deal_partner_phone": deal_partner_phone,
            "deal_partner_email": deal_partner_email,
            "is_deal_party": is_deal_party,
            "deal_confirmed_by_me": deal_confirmed_by_me,
            "deal_confirmed_by_other": deal_confirmed_by_other,
            "deal_confirmations_count": len(set(deal_confirmations)),
            "is_direct": bool(item.get("direct_supplier_id")),
            "my_rating": my_rating,
            "can_rate": can_rate,
            "rate_target_id": rate_target_id,
            "rate_target_name": rate_target_name,
            **offer_deadline_info(item),
        },
        viewer,
    )


def find_request(request_id):
    if db_store.use_db():
        db_store.ensure_migrated()
        item = db_store.get_request_by_id(request_id)
        if item:
            return [item], 0, item
        return [], -1, None
    items = load_requests()
    for i, item in enumerate(items):
        if item["id"] == request_id:
            return items, i, item
    return items, -1, None


def can_access_deal(item, user):
    if not user or not item:
        return False
    if item.get("status") not in ("deal", "completed"):
        return False
    if user["role"] == "user":
        return item.get("user_id") == user["id"]
    if user["role"] == "supplier":
        offer = next(
            (o for o in item.get("offers", []) if o["id"] == item.get("accepted_offer_id")),
            None,
        )
        cid = company_id(user)
        return bool(offer and cid and offer.get("supplier_id") == cid)
    return False


def home_redirect():
    """Отправить залогиненного на home / dashboard / admin."""
    user = current_user()
    if not user:
        return url_for("login")
    if user.get("role") == "admin":
        return url_for("admin_page")
    if user["role"] == "supplier":
        return url_for("dashboard")
    return url_for("home")


def is_admin(user=None) -> bool:
    u = user if user is not None else current_user()
    return bool(u and u.get("role") == "admin")


def admin_required(view):
    """HTML: только админ, иначе редирект."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        user = current_user()
        if not is_admin(user):
            return redirect(home_redirect())
        return view(*args, **kwargs)

    return wrapped


def api_admin_required(view):
    """API: только админ."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"ok": False, "error": "Нужна авторизация"}), 401
        if not is_admin():
            return jsonify({"ok": False, "error": "Только для администратора"}), 403
        return view(*args, **kwargs)

    return wrapped


def bin_is_valid(bin_value: str) -> bool:
    return bool(bin_value) and bin_value.isdigit() and len(bin_value) == 12


def find_bin_owner(bin_value: str, exclude_user_id=None):
    """Найти другого владельца-поставщика с тем же БИН (менеджеры без БИН)."""
    if not bin_value:
        return None
    for u in load_users():
        if u.get("role") != "supplier" or supplier_role_of(u) != "owner":
            continue
        if exclude_user_id and u.get("id") == exclude_user_id:
            continue
        if (u.get("supplier") or {}).get("bin") == bin_value:
            return u
    return None


def ensure_admin_user() -> None:
    """Создать админа из env, если его ещё нет (idempotent)."""
    email = (os.environ.get("ADMIN_EMAIL") or "admin@huphup.kz").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or "admin1234"
    name = (os.environ.get("ADMIN_NAME") or "Администратор").strip() or "Администратор"
    users = load_users()
    existing = next((u for u in users if u.get("email", "").lower() == email), None)
    if existing:
        if existing.get("role") != "admin":
            existing["role"] = "admin"
            existing.pop("blocked", None)
            save_users(users)
        return
    users.append(
        {
            "id": str(uuid.uuid4()),
            "role": "admin",
            "name": name,
            "email": email,
            "password": generate_password_hash(password),
            "created_at": now_iso(),
        }
    )
    save_users(users)


def public_admin_user(user):
    """Карточка пользователя для админ-списка (без пароля)."""
    s = user.get("supplier") or {} if isinstance(user.get("supplier"), dict) else {}
    cats = (
        supplier_categories(s)
        if user.get("role") == "supplier"
        else (user.get("preferred_categories") or [])
    )
    legal = s.get("legal_address") or ""
    actual = s.get("actual_address") or ""
    city = ""
    if user.get("role") == "supplier":
        city = (actual or legal or "").split(",")[0].strip()
    else:
        city = user.get("city") or ""
    return {
        "id": user.get("id") or "",
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "role": user.get("role") or "",
        "supplier_role": supplier_role_of(user) if user.get("role") == "supplier" else "",
        "blocked": bool(user.get("blocked")),
        "created_at": user.get("created_at") or "",
        "blocked_at": user.get("blocked_at") or "",
        "company_name": s.get("company_name") or user.get("company") or "",
        "bin": s.get("bin") or user.get("bin") or "",
        "phone": s.get("phone") or user.get("phone") or "",
        "contact_person": s.get("contact_person") or "",
        "category": s.get("category") or "",
        "categories": cats if isinstance(cats, list) else [],
        "city": city,
        "legal_address": legal,
        "actual_address": actual,
        "bank_name": s.get("bank_name") or "",
        "iban": s.get("iban") or "",
        "bik": s.get("bik") or "",
        "website": s.get("website") or user.get("website") or "",
        "years_on_market": s.get("years_on_market") or "",
        "description": (s.get("description") or user.get("about") or "")[:200],
        "position": user.get("position") or "",
        "company_supplier_id": user.get("company_supplier_id") or "",
    }


def _admin_arg(name: str) -> str:
    return (request.args.get(name) or "").strip()


def _admin_arg_lower(name: str) -> str:
    return _admin_arg(name).lower()


def _admin_date_ok(value: str, date_from: str, date_to: str) -> bool:
    day = (value or "")[:10]
    if date_from and (not day or day < date_from):
        return False
    if date_to and (not day or day > date_to):
        return False
    return True


def _admin_contains(hay: str, needle: str) -> bool:
    if not needle:
        return True
    return needle in (hay or "").lower()


def _admin_int(name: str, default=None):
    raw = _admin_arg(name)
    if raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _admin_paginate(items: list) -> tuple[list, int, int, int]:
    """Slice filtered admin lists. Returns (page_items, total, limit, offset)."""
    total = len(items)
    limit = _admin_int("limit", 100)
    if limit is None:
        limit = 100
    limit = max(1, min(200, int(limit)))
    offset = _admin_int("offset", 0) or 0
    offset = max(0, int(offset))
    return items[offset : offset + limit], total, limit, offset


# --- HTML-страницы ---


@app.route("/")
def index():
    if session.get("user_id"):
        return redirect(home_redirect())
    return render_template("index.html")


@app.route("/login")
def login():
    if session.get("user_id"):
        return redirect(home_redirect())
    return render_template("login.html")


@app.route("/register")
def register():
    if session.get("user_id"):
        return redirect(home_redirect())
    return render_template("register.html", categories=CATEGORY_OPTIONS)


@app.route("/home")
@login_required
def home():
    user = current_user()
    if user.get("role") == "admin":
        return redirect(url_for("admin_page"))
    if user["role"] == "supplier":
        return redirect(url_for("dashboard"))
    return render_template(
        "home.html",
        user=user,
        categories=CATEGORY_OPTIONS,
        first_name=first_name(user["name"]),
        avatar_initials=avatar_initials(user["name"]),
        avatar_tone=avatar_tone(user["name"]),
    )


@app.route("/dashboard")
@login_required
def dashboard():
    user = current_user()
    if user.get("role") == "admin":
        return redirect(url_for("admin_page"))
    if user["role"] == "user":
        return redirect(url_for("home"))
    catalog = load_catalog() or {}
    owner = company_user(user) or user
    supplier = company_supplier_profile(user)
    catalog_categories = catalog.get("categories") or []
    try:
        catalog_categories = json.loads(json.dumps(catalog_categories, ensure_ascii=False))
    except (TypeError, ValueError):
        catalog_categories = []
    supplier_category = str((supplier or {}).get("category") or "")
    supplier_categories_list = supplier_categories(supplier)
    s_role = supplier_role_of(user)
    return render_template(
        "dashboard.html",
        user=user,
        supplier_role=s_role,
        is_owner=s_role == "owner",
        company_name=(supplier or {}).get("company_name") or user.get("name") or "",
        categories=CATEGORY_OPTIONS,
        category_options=CATEGORY_OPTIONS,
        catalog_categories=catalog_categories,
        supplier_category=supplier_category,
        supplier_categories=supplier_categories_list,
        stock_status_options=STOCK_STATUS_OPTIONS,
        avatar_initials=avatar_initials(
            (supplier or {}).get("company_name") or user.get("name") or ""
        ),
        avatar_tone=avatar_tone(
            (supplier or {}).get("company_name") or user.get("name") or ""
        ),
        s=supplier,
    )


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# --- API каталога / товаров / избранного ---


@app.route("/api/catalog")
@api_login_required
def api_catalog():
    catalog = load_catalog()
    return jsonify(
        {
            "ok": True,
            "categories": catalog.get("categories") or [],
            "templates": catalog.get("templates") or [],
        }
    )


@app.route("/api/products")
@api_login_required
def api_products():
    catalog = load_catalog()
    products = catalog.get("products") or []
    category = (request.args.get("category") or "").strip()
    subcategory = (request.args.get("subcategory") or "").strip()
    q = (request.args.get("q") or "").strip().lower()
    mine = (request.args.get("mine") or "").strip() == "1"
    city = (request.args.get("city") or "").strip().lower()
    stock_status = (request.args.get("stock_status") or "").strip()
    price_min_raw = (request.args.get("price_min") or "").strip()
    price_max_raw = (request.args.get("price_max") or "").strip()
    user = current_user()

    items = products
    if mine:
        if user["role"] != "supplier":
            return jsonify({"ok": False, "error": "Только для поставщика"}), 403
        cid = company_id(user)
        items = [p for p in items if p.get("supplier_id") == cid]
    if category:
        items = [p for p in items if p.get("category") == category]
    supplier_id = (request.args.get("supplier_id") or "").strip()
    if supplier_id:
        items = [p for p in items if p.get("supplier_id") == supplier_id]
    if subcategory:
        items = [
            p
            for p in items
            if p.get("subcategory_id") == subcategory or p.get("subcategory") == subcategory
        ]
    if q:
        items = [
            p
            for p in items
            if q in (p.get("name") or "").lower()
            or q in (p.get("description") or "").lower()
            or q in (p.get("subcategory") or "").lower()
        ]
    if stock_status in STOCK_STATUS_OPTIONS:
        items = [
            p
            for p in items
            if (p.get("stock_status") or "in_stock") == stock_status
        ]

    users_by_id = None
    if city:
        users_by_id = {u["id"]: u for u in load_users()}

        def _product_city(p):
            u = users_by_id.get(p.get("supplier_id"))
            if not u:
                return ""
            s = u.get("supplier") or {}
            hay = " ".join(
                [
                    str(s.get("actual_address") or ""),
                    str(s.get("legal_address") or ""),
                    str(s.get("city") or ""),
                    str(u.get("city") or ""),
                ]
            ).lower()
            return hay

        items = [p for p in items if city in _product_city(p)]

    def _price_num(p):
        try:
            return float(str(p.get("price")).replace(" ", "").replace(",", "."))
        except (TypeError, ValueError):
            return None

    price_min = None
    price_max = None
    try:
        if price_min_raw:
            price_min = float(price_min_raw)
        if price_max_raw:
            price_max = float(price_max_raw)
    except ValueError:
        return jsonify({"ok": False, "error": "Некорректный фильтр цены"}), 400

    if price_min is not None or price_max is not None:
        filtered = []
        for p in items:
            n = _price_num(p)
            if n is None:
                continue
            if price_min is not None and n < price_min:
                continue
            if price_max is not None and n > price_max:
                continue
            filtered.append(p)
        items = filtered

    items = sorted(items, key=lambda p: p.get("created_at") or "", reverse=True)
    show_price = user and user.get("role") in ("user", "supplier")
    public_items = []
    for p in items:
        row = dict(p)
        if not show_price:
            row.pop("price", None)
        elif "price" not in row:
            row["price"] = None
        if not row.get("stock_status"):
            row["stock_status"] = "in_stock"
            row["stock_label"] = STOCK_STATUS_OPTIONS.get("in_stock", "В наличии")
        if not row.get("image_url") and not product_image_list(row):
            row["image_url"] = CATALOG_PLACEHOLDER
        else:
            _sync_product_cover(row)
            if not row.get("image_url"):
                row["image_url"] = CATALOG_PLACEHOLDER
        public_items.append(row)
    return jsonify({"ok": True, "items": public_items})


def _resolve_subcategory(catalog, category_name, subcategory_id):
    raw = (subcategory_id or "").strip()
    if not raw:
        return "", ""
    if raw in ("general", "Общее"):
        return "general", "Общее"
    for cat in catalog.get("categories") or []:
        if cat.get("name") != category_name:
            continue
        for sub in cat.get("subcategories") or []:
            if sub.get("id") == raw or sub.get("name") == raw:
                return sub.get("id") or raw, sub.get("name") or raw
    # Неизвестная подкатегория — оставляем как custom в этой категории
    return raw, raw


def _find_product_template(catalog, template_id: str):
    tid = (template_id or "").strip()
    if not tid:
        return None
    for tpl in catalog.get("templates") or []:
        if tpl.get("id") == tid:
            return tpl
    return None


def _apply_product_image(product, data, fallback=""):
    """Поставить своё фото поставщика, иначе fallback/существующее."""
    if "image_url" not in data:
        if fallback:
            product["image_url"] = fallback
        elif product.get("image_url"):
            pass
        else:
            product.pop("image_url", None)
        return None
    normalized = _normalize_product_image_url(data.get("image_url"))
    if normalized is None:
        return "Некорректное фото товара"
    if normalized:
        product["image_url"] = normalized
    else:
        product.pop("image_url", None)
    return None


def _product_payload(data, catalog, user, existing=None):
    """Собрать товар: только из шаблона каталога (+ статус и своё фото)."""
    stock_status = (data.get("stock_status") or "").strip() or "in_stock"
    if stock_status not in STOCK_STATUS_OPTIONS:
        stock_status = "in_stock"

    template_id = (data.get("template_id") or "").strip()
    if existing and not template_id:
        # Редактирование: статус наличия + свои фото
        product = {
            **existing,
            "stock_status": stock_status,
            "stock_label": STOCK_STATUS_OPTIONS[stock_status],
            "updated_at": now_iso(),
        }
        err = _apply_product_images(
            product, data, fallback_urls=product_image_list(existing)
        )
        if err:
            return None, err
        return product, None

    tpl = _find_product_template(catalog, template_id)
    if not tpl:
        return None, "Выберите товар из каталога"

    name = (tpl.get("name") or "").strip()
    category = (tpl.get("category") or "").strip()
    subcategory_id = (tpl.get("subcategory_id") or "").strip() or "general"
    subcategory = (tpl.get("subcategory") or subcategory_id).strip()
    unit = (tpl.get("unit") or "").strip() or "шт"
    description = (tpl.get("description") or "").strip()
    template_image = (tpl.get("image_url") or "").strip()
    template_images = product_image_list(tpl) or (
        [template_image] if template_image and template_image != CATALOG_PLACEHOLDER else []
    )

    if not name or not category:
        return None, "Шаблон товара повреждён"
    # Любая категория каталога; при необходимости дополняем профиль компании
    if category not in CATEGORY_OPTIONS:
        return None, "Категория шаблона недоступна"

    ensure_catalog_categories(catalog)
    sub_id, sub_name = _resolve_subcategory(catalog, category, subcategory_id)
    if not sub_id:
        sub_id, sub_name = subcategory_id, subcategory

    supplier = company_supplier_profile(user)
    company = supplier.get("company_name") or user.get("name") or ""
    cid = company_id(user) or user["id"]

    # Не дублировать один и тот же шаблон у компании
    products = catalog.get("products") or []
    for p in products:
        if (
            p.get("supplier_id") == cid
            and p.get("template_id") == tpl.get("id")
            and (not existing or p.get("id") != existing.get("id"))
        ):
            return None, "Этот товар уже добавлен в ваш каталог"

    product = {
        **(existing or {}),
        "template_id": tpl.get("id"),
        "name": name,
        "category": category,
        "subcategory_id": sub_id,
        "subcategory": sub_name,
        "unit": unit,
        "description": description,
        "stock_status": stock_status,
        "stock_label": STOCK_STATUS_OPTIONS[stock_status],
        "supplier_id": cid,
        "supplier_name": company,
    }
    fallback = []
    if "image_urls" not in data and "image_url" not in data:
        fallback = product_image_list(existing) if existing else []
        if not fallback:
            fallback = list(template_images)
    err = _apply_product_images(product, data, fallback_urls=fallback)
    if err:
        return None, err
    if not product_image_list(product) and template_images:
        product["image_urls"] = template_images[:MAX_PRODUCT_IMAGES]
        product["image_url"] = template_images[0]
    product.pop("price", None)
    if not existing:
        product["id"] = str(uuid.uuid4())
        product["created_at"] = now_iso()
    product["updated_at"] = now_iso()
    return product, None


@app.route("/api/my/products", methods=["GET", "POST"])
@api_login_required
def api_my_products():
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403

    catalog = load_catalog()
    # Гарантировать шаблоны даже на старой БД
    if not catalog.get("templates"):
        try:
            from scripts.seed_catalog import build_templates, CATALOG as SEED_CATS

            catalog["templates"] = build_templates(catalog.get("categories") or SEED_CATS)
            save_catalog(catalog)
        except Exception:
            catalog.setdefault("templates", [])

    products = catalog.setdefault("products", [])
    cid = company_id(user)

    if request.method == "GET":
        mine = [p for p in products if p.get("supplier_id") == cid]
        mine = sorted(mine, key=lambda p: p.get("updated_at") or p.get("created_at") or "", reverse=True)
        public_mine = []
        for p in mine:
            row = {k: v for k, v in p.items() if k != "price"}
            urls = product_image_list(row)
            if urls:
                row["image_urls"] = urls
                row["image_url"] = urls[0]
            public_mine.append(row)
        return jsonify({"ok": True, "items": public_mine, "templates": catalog.get("templates") or [], "max_images": MAX_PRODUCT_IMAGES})

    data = request.get_json(silent=True) or {}
    product, err = _product_payload(data, catalog, user)
    if err:
        return jsonify({"ok": False, "error": err}), 400
    products.append(product)
    save_catalog(catalog)
    ensure_company_category(user, product.get("category") or "")
    cats = supplier_categories(company_supplier_profile(user))
    return jsonify(
        {
            "ok": True,
            "item": product,
            "message": "Товар добавлен",
            "categories": cats,
        }
    )


@app.route("/api/my/products/image", methods=["POST"])
@api_login_required
def api_my_product_image():
    """Загрузить фото товара поставщика (PNG/JPG/WEBP, до 5 МБ)."""
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify({"ok": False, "error": "Выберите фото"}), 400

    raw = upload.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        return jsonify({"ok": False, "error": "Файл слишком большой (макс. 5 МБ)"}), 400
    if not raw:
        return jsonify({"ok": False, "error": "Пустой файл"}), 400

    safe_name = secure_filename(upload.filename) or "photo"
    mime = (upload.mimetype or "").split(";")[0].strip().lower()
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    if ext not in ALLOWED_PRODUCT_IMAGE_EXT:
        return jsonify({"ok": False, "error": "Допустимы PNG, JPG, WEBP"}), 400
    if mime and mime not in ALLOWED_PRODUCT_IMAGE_MIME:
        guess, _ = mimetypes.guess_type(safe_name)
        if guess and guess not in ALLOWED_PRODUCT_IMAGE_MIME:
            return jsonify({"ok": False, "error": "Допустимы PNG, JPG, WEBP"}), 400

    PRODUCT_IMG_DIR.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    blob_path = PRODUCT_IMG_DIR / f"{file_id}.{ext}"
    blob_path.write_bytes(raw)
    url = f"/static/uploads/products/{file_id}.{ext}"
    return jsonify({"ok": True, "url": url})


@app.route("/static/uploads/products/<path:filename>")
def serve_product_upload(filename):
    """Фото товаров: на Vercel пишутся в /tmp, отдаём явно (не только static_folder)."""
    name = Path(filename).name
    if not name or "/" in filename or "\\" in filename or name != filename:
        return ("", 404)
    blob_path = PRODUCT_IMG_DIR / name
    if not blob_path.is_file():
        return ("", 404)
    return send_file(blob_path)


@app.route("/api/my/products/<product_id>", methods=["PUT", "DELETE"])
@api_login_required
def api_my_product_item(product_id):
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403

    catalog = load_catalog()
    products = catalog.setdefault("products", [])
    index = next((i for i, p in enumerate(products) if p.get("id") == product_id), -1)
    if index < 0:
        return jsonify({"ok": False, "error": "Товар не найден"}), 404
    if products[index].get("supplier_id") != company_id(user):
        return jsonify({"ok": False, "error": "Можно менять только свои товары"}), 403

    if request.method == "DELETE":
        products.pop(index)
        save_catalog(catalog)
        return jsonify({"ok": True, "message": "Товар удалён"})

    data = request.get_json(silent=True) or {}
    product, err = _product_payload(data, catalog, user, existing=products[index])
    if err:
        return jsonify({"ok": False, "error": err}), 400
    products[index] = product
    save_catalog(catalog)
    return jsonify({"ok": True, "item": product, "message": "Товар обновлён"})


@app.route("/api/suppliers/<supplier_id>")
@api_login_required
def api_supplier_profile(supplier_id):
    target = find_user_by_id(supplier_id)
    if not target or target.get("role") != "supplier":
        return jsonify({"ok": False, "error": "Поставщик не найден"}), 404

    catalog = load_catalog()
    products = [
        public_product(p)
        for p in (catalog.get("products") or [])
        if p.get("supplier_id") == supplier_id
    ]
    products = sorted(
        products,
        key=lambda p: p.get("updated_at") or p.get("created_at") or "",
        reverse=True,
    )
    profile = public_supplier(target)
    viewer = current_user()
    favorited = False
    if viewer and viewer.get("role") == "user":
        favorited = supplier_id in normalize_favorites(viewer).get("suppliers", [])

    return jsonify(
        {
            "ok": True,
            "supplier": profile,
            "products": products,
            "favorited": favorited,
        }
    )


@app.route("/api/favorites", methods=["GET", "POST", "DELETE"])
@api_login_required
def api_favorites():
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Избранное только для покупателя"}), 403

    users, index = find_user_index(session["user_id"])
    if index < 0:
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 401

    if request.method == "GET":
        return jsonify({"ok": True, **resolve_favorites(users[index])})

    data = request.get_json(silent=True) or {}
    fav_type = (data.get("type") or "").strip().lower()
    item_id = str(data.get("id") or "").strip()
    if fav_type not in ("product", "supplier"):
        return jsonify({"ok": False, "error": "type: product или supplier"}), 400
    if not item_id:
        return jsonify({"ok": False, "error": "Укажите id"}), 400

    key = "products" if fav_type == "product" else "suppliers"

    if fav_type == "product":
        catalog = load_catalog()
        exists = any(p.get("id") == item_id for p in (catalog.get("products") or []))
        if not exists:
            return jsonify({"ok": False, "error": "Товар не найден"}), 404
    else:
        target = find_user_by_id(item_id)
        if not target or target.get("role") != "supplier":
            return jsonify({"ok": False, "error": "Поставщик не найден"}), 404

    fav = normalize_favorites(users[index])
    ids = fav[key]
    if request.method == "POST":
        if item_id not in ids:
            ids.append(item_id)
        favorited = True
        message = "Добавлено в избранное"
    else:
        ids = [x for x in ids if x != item_id]
        favorited = False
        message = "Удалено из избранного"

    fav[key] = ids
    users[index]["favorites"] = fav
    save_users(users)
    return jsonify(
        {
            "ok": True,
            "favorited": favorited,
            "type": fav_type,
            "id": item_id,
            "message": message,
            **resolve_favorites(users[index]),
        }
    )


# --- API auth / профиля ---


def _verify_code_digest(code: str) -> str:
    raw = f"{app.secret_key}:email-verify:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _purge_pending_registrations():
    now = time.time()
    if db_store.use_db():
        db_store.ensure_migrated()
        db_store.purge_expired_pending_registrations(now)
        return
    expired = [k for k, v in _PENDING_REGISTRATIONS.items() if v.get("expires_at", 0) < now]
    for k in expired:
        _PENDING_REGISTRATIONS.pop(k, None)


def _build_register_user(data: dict):
    """Валидация полей регистрации → (user_dict | None, error_response | None)."""
    invite_token = (data.get("invite") or data.get("invite_token") or "").strip()
    invite_owner, invite_rec, _ = find_invite(invite_token) if invite_token else (None, None, -1)
    if invite_token:
        if not invite_owner or not invite_is_valid(invite_rec):
            return None, (jsonify({"ok": False, "error": "Ссылка приглашения недействительна или устарела"}), 400)

    role = (data.get("role") or "").strip()
    if invite_token:
        role = "supplier"
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if role not in ("user", "supplier"):
        return None, (jsonify({"ok": False, "error": "Выберите роль: пользователь или поставщик"}), 400)
    if not name:
        return None, (jsonify({"ok": False, "error": "Укажите имя"}), 400)
    if not email or "@" not in email:
        return None, (jsonify({"ok": False, "error": "Укажите корректный email"}), 400)
    if len(password) < 6:
        return None, (jsonify({"ok": False, "error": "Пароль должен быть не короче 6 символов"}), 400)
    if find_user_by_email(email):
        return None, (jsonify({"ok": False, "error": "Пользователь с таким email уже существует"}), 400)

    user = {
        "id": str(uuid.uuid4()),
        "role": role,
        "name": name,
        "email": email,
        "password": generate_password_hash(password),
        "created_at": now_iso(),
        "email_verified": True,
    }

    if invite_token and invite_owner:
        user["supplier_role"] = "manager"
        user["company_supplier_id"] = invite_owner["id"]
        user["_invite_token"] = invite_token
    elif role == "supplier":
        supplier = pick_supplier(data)
        if not supplier["company_name"]:
            return None, (jsonify({"ok": False, "error": "Укажите название компании"}), 400)
        if not bin_is_valid(supplier["bin"]):
            return None, (jsonify({"ok": False, "error": "БИН должен состоять из 12 цифр"}), 400)
        if find_bin_owner(supplier["bin"]):
            return None, (jsonify({"ok": False, "error": "Поставщик с таким БИН уже зарегистрирован"}), 400)
        if not supplier["phone"]:
            return None, (jsonify({"ok": False, "error": "Укажите телефон"}), 400)
        if not supplier_categories(supplier):
            return None, (jsonify({"ok": False, "error": "Выберите хотя бы одну категорию"}), 400)
        user["supplier"] = supplier
        user["supplier"].setdefault("offer_templates", [])
        user["supplier_role"] = "owner"
        user["invites"] = []
    else:
        user["favorites"] = {"products": [], "suppliers": []}

    return user, None


def _issue_register_code(email: str, user: dict):
    """Создать 6-значный код, сохранить pending и попытаться отправить письмо."""
    _purge_pending_registrations()
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = time.time()
    record = {
        "code_digest": _verify_code_digest(code),
        "user": user,
        "expires_at": now + EMAIL_VERIFY_TTL_SEC,
        "sent_at": now,
        "attempts": 0,
    }
    _pending_save(email, record)
    subject = "HupHup — код подтверждения"
    body = (
        f"Ваш код подтверждения регистрации: {code}\n\n"
        f"Код действует 15 минут.\n"
        f"Если вы не регистрировались на HupHup — просто игнорируйте это письмо.\n"
    )
    mailed = False
    if smtp_configured():
        mailed = send_mail(email, subject, body)
    if not mailed and ((not IS_PRODUCTION) or ALLOW_DEV_CODE):
        print(f"[email-verify] SMTP off/fail — code for {email}: {code}")
    return code, mailed


def _expose_dev_code() -> bool:
    """Показывать код в API, если нет SMTP (dev или ALLOW_DEV_CODE на Vercel)."""
    return (not IS_PRODUCTION) or ALLOW_DEV_CODE


def _finalize_registration(user: dict):
    if find_user_by_email(user["email"]):
        return None, (jsonify({"ok": False, "error": "Пользователь с таким email уже существует"}), 400)
    invite_token = user.pop("_invite_token", None)
    if user.get("role") == "supplier" and supplier_role_of(user) == "owner":
        bin_val = (user.get("supplier") or {}).get("bin") or ""
        if bin_val and find_bin_owner(bin_val):
            return None, (jsonify({"ok": False, "error": "Поставщик с таким БИН уже зарегистрирован"}), 400)
    if invite_token:
        owner, inv, inv_i = find_invite(invite_token)
        if not owner or not invite_is_valid(inv):
            return None, (jsonify({"ok": False, "error": "Ссылка приглашения недействительна или устарела"}), 400)
        invites = owner.get("invites") if isinstance(owner.get("invites"), list) else []
        for i, rec in enumerate(invites):
            if isinstance(rec, dict) and rec.get("token") == invite_token:
                invites[i] = {
                    **rec,
                    "used_by": user["id"],
                    "used_at": now_iso(),
                    "used_email": user["email"],
                }
                owner["invites"] = invites
                save_user(owner)
                break
        user["company_supplier_id"] = owner["id"]
        user["supplier_role"] = "manager"
    save_user(user)
    session["user_id"] = user["id"]
    session["role"] = user["role"]
    return user, None


@app.route("/api/register", methods=["POST"])
def api_register():
    if not check_auth_rate_limit():
        return jsonify({"ok": False, "error": "Слишком много попыток. Подождите и повторите."}), 429
    data = request.get_json(silent=True) or {}
    user, err = _build_register_user(data)
    if err:
        return err

    email = user["email"]
    code, mailed = _issue_register_code(email, user)

    if IS_PRODUCTION and not mailed and not ALLOW_DEV_CODE:
        _pending_delete(email)
        return jsonify({
            "ok": False,
            "error": "Не удалось отправить код на email. Проверьте SMTP или попробуйте позже.",
        }), 503

    payload = {
        "ok": True,
        "needs_verification": True,
        "email": email,
        "message": f"Код подтверждения отправлен на {email}",
    }
    # В разработке / на демо без SMTP отдаём код в ответе
    if not mailed and _expose_dev_code():
        payload["dev_code"] = code
        payload["message"] = (
            f"SMTP не настроен — код в консоли сервера. Для теста: {code}"
        )
    return jsonify(payload)


@app.route("/api/register/verify", methods=["POST"])
def api_register_verify():
    if not check_auth_rate_limit():
        return jsonify({"ok": False, "error": "Слишком много попыток. Подождите и повторите."}), 429
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = re.sub(r"\D", "", str(data.get("code") or ""))
    if not email or len(code) != 6:
        return jsonify({"ok": False, "error": "Введите email и 6-значный код"}), 400

    _purge_pending_registrations()
    pending = _pending_get(email)
    if not pending:
        return jsonify({"ok": False, "error": "Код истёк или не найден. Запросите новый."}), 400

    attempts = int(pending.get("attempts") or 0) + 1
    _pending_update_attempts(email, attempts)
    if attempts > 8:
        _pending_delete(email)
        return jsonify({
            "ok": False,
            "error": "Слишком много неверных попыток. Пройдите регистрацию снова.",
        }), 429

    expected = pending.get("code_digest") or ""
    if not hmac.compare_digest(expected, _verify_code_digest(code)):
        return jsonify({"ok": False, "error": "Неверный код подтверждения"}), 400

    user = pending.get("user")
    _pending_delete(email)
    if not user:
        return jsonify({"ok": False, "error": "Данные регистрации потеряны. Начните снова."}), 400

    _, err = _finalize_registration(user)
    if err:
        return err
    track_event(
        "register",
        path="/api/register/verify",
        meta={"role": user.get("role") or "", "email": user.get("email") or ""},
    )
    return jsonify({"ok": True, "redirect": home_redirect()})


@app.route("/api/register/resend", methods=["POST"])
def api_register_resend():
    if not check_auth_rate_limit():
        return jsonify({"ok": False, "error": "Слишком много попыток. Подождите и повторите."}), 429
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"ok": False, "error": "Укажите email"}), 400

    _purge_pending_registrations()
    pending = _pending_get(email)
    if not pending:
        return jsonify({"ok": False, "error": "Сначала заполните форму регистрации"}), 400

    now = time.time()
    last = float(pending.get("sent_at") or 0)
    wait = EMAIL_VERIFY_RESEND_SEC - (now - last)
    if wait > 0:
        return jsonify({
            "ok": False,
            "error": f"Подождите ещё {int(wait)} сек. перед повторной отправкой",
        }), 429

    user = pending.get("user")
    if not user:
        return jsonify({"ok": False, "error": "Данные регистрации потеряны. Начните снова."}), 400

    code, mailed = _issue_register_code(email, user)
    if IS_PRODUCTION and not mailed and not ALLOW_DEV_CODE:
        return jsonify({"ok": False, "error": "Не удалось отправить письмо. Попробуйте позже."}), 503

    payload = {"ok": True, "email": email, "message": f"Новый код отправлен на {email}"}
    if not mailed and _expose_dev_code():
        payload["dev_code"] = code
        payload["message"] = f"SMTP не настроен — код: {code}"
    return jsonify(payload)


@app.route("/api/login", methods=["POST"])
def api_login():
    if not check_auth_rate_limit():
        return jsonify({"ok": False, "error": "Слишком много попыток. Подождите и повторите."}), 429
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = find_user_by_email(email)
    if not user or not check_password_hash(user["password"], password):
        return jsonify({"ok": False, "error": "Неверный email или пароль"}), 401
    if user.get("blocked"):
        return jsonify({"ok": False, "error": "Аккаунт заблокирован. Обратитесь в поддержку."}), 403

    session["user_id"] = user["id"]
    session["role"] = user["role"]
    track_event("login", path="/api/login", meta={"email": user.get("email") or ""})
    return jsonify({"ok": True, "redirect": home_redirect()})


def buyer_profile_payload(user):
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "phone": user.get("phone") or "",
        "company": user.get("company") or "",
        "city": user.get("city") or "",
        "position": user.get("position") or "",
        "bin": user.get("bin") or "",
        "website": user.get("website") or "",
        "address": user.get("address") or "",
        "about": user.get("about") or "",
        "preferred_categories": [
            c for c in (user.get("preferred_categories") or []) if c in CATEGORY_OPTIONS
        ],
        "created_at": user.get("created_at") or "",
    }


@app.route("/api/profile", methods=["POST"])
@api_login_required
def api_profile():
    data = request.get_json(silent=True) or {}
    user = find_user_by_id(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 401

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Укажите имя"}), 400
    user["name"] = name

    if user["role"] == "user":
        user["phone"] = (data.get("phone") or "").strip()[:40]
        user["company"] = (data.get("company") or "").strip()[:120]
        user["city"] = (data.get("city") or "").strip()[:80]
        user["position"] = (data.get("position") or "").strip()[:80]
        if "bin" in data:
            bin_val = (data.get("bin") or "").strip()
            if bin_val:
                if not bin_val.isdigit() or len(bin_val) != 12:
                    return jsonify({"ok": False, "error": "БИН должен состоять из 12 цифр"}), 400
                user["bin"] = bin_val
            else:
                user["bin"] = ""
        if "website" in data:
            user["website"] = (data.get("website") or "").strip()[:200]
        user["address"] = (data.get("address") or "").strip()[:200]
        user["about"] = (data.get("about") or "").strip()[:500]
        cats = data.get("preferred_categories")
        if isinstance(cats, list):
            user["preferred_categories"] = [
                c for c in cats if isinstance(c, str) and c in CATEGORY_OPTIONS
            ][:10]

    if user["role"] == "supplier":
        if is_supplier_manager(user):
            # Менеджер может менять только своё имя
            save_user(user)
            return jsonify(
                {
                    "ok": True,
                    "message": "Профиль сохранён",
                    "user": {
                        "id": user.get("id"),
                        "name": user.get("name"),
                        "email": user.get("email"),
                        "role": user.get("role"),
                        "supplier_role": "manager",
                        "company_supplier_id": company_id(user),
                        "supplier": company_supplier_profile(user),
                    },
                }
            )
        supplier = pick_supplier(data, user.get("supplier"))
        if not supplier["company_name"]:
            return jsonify({"ok": False, "error": "Укажите название компании"}), 400
        if not bin_is_valid(supplier["bin"]):
            return jsonify({"ok": False, "error": "БИН должен состоять из 12 цифр"}), 400
        if find_bin_owner(supplier["bin"], exclude_user_id=user["id"]):
            return jsonify({"ok": False, "error": "Поставщик с таким БИН уже зарегистрирован"}), 400
        if not supplier["phone"]:
            return jsonify({"ok": False, "error": "Укажите телефон"}), 400
        if not supplier_categories(supplier):
            return jsonify({"ok": False, "error": "Выберите хотя бы одну категорию"}), 400
        # keep templates
        prev = user.get("supplier") or {}
        if "offer_templates" in prev and "offer_templates" not in supplier:
            supplier["offer_templates"] = prev.get("offer_templates") or []
        user["supplier"] = supplier
        user.setdefault("supplier_role", "owner")

    save_user(user)
    profile_user = (
        buyer_profile_payload(user)
        if user["role"] == "user"
        else {
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "phone": (user.get("supplier") or {}).get("phone") or "",
            "supplier": {
                "company_name": (user.get("supplier") or {}).get("company_name") or "",
            },
        }
    )
    return jsonify(
        {
            "ok": True,
            "message": "Профиль сохранён",
            "user": profile_user,
        }
    )


@app.route("/api/password", methods=["POST"])
@api_login_required
def api_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new_password = data.get("new_password") or ""
    if len(new_password) < 6:
        return jsonify({"ok": False, "error": "Пароль должен быть не короче 6 символов"}), 400

    user = find_user_by_id(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 401

    if not check_password_hash(user["password"], current):
        return jsonify({"ok": False, "error": "Неверный текущий пароль"}), 401

    user["password"] = generate_password_hash(new_password)
    save_user(user)
    return jsonify({"ok": True, "message": "Пароль изменён"})


@app.route("/api/my/stats")
@api_login_required
def api_my_stats():
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Только для покупателя"}), 403

    items = [r for r in load_requests() if r.get("user_id") == user["id"]]
    fav = normalize_favorites(user)
    active = sum(
        1 for r in items if (r.get("status") or "sent") in ("sent", "deal")
    )
    completed = sum(1 for r in items if (r.get("status") or "") == "completed")
    offers_received = sum(len(r.get("offers") or []) for r in items)

    return jsonify(
        {
            "ok": True,
            "member_since": user.get("created_at") or "",
            "stats": {
                "requests_total": len(items),
                "active": active,
                "completed": completed,
                "favorites_products": len(fav.get("products") or []),
                "favorites_suppliers": len(fav.get("suppliers") or []),
                "offers_received": offers_received,
            },
        }
    )


@app.route("/api/me")
def api_me():
    user = current_user()
    if not user:
        return jsonify({"ok": False}), 401
    payload = dict(user)
    if user.get("role") == "supplier":
        payload["supplier_role"] = supplier_role_of(user)
        payload["company_supplier_id"] = company_id(user)
        payload["supplier"] = company_supplier_profile(user)
        payload["is_owner"] = is_supplier_owner(user)
    return jsonify({"ok": True, "user": payload})


# --- Уведомления / аналитика поставщика / шаблоны офферов ---


@app.route("/api/notifications", methods=["GET"])
@api_login_required
def api_notifications():
    maybe_deadline_reminders()
    user = current_user()
    all_notes = [
        n for n in load_notifications() if n.get("user_id") == user["id"]
    ]
    all_notes = sorted(all_notes, key=lambda n: n.get("created_at", ""), reverse=True)
    unread = sum(1 for n in all_notes if not n.get("read"))
    limit = min(int(request.args.get("limit") or 40), 100)
    return jsonify(
        {
            "ok": True,
            "items": all_notes[:limit],
            "unread": unread,
        }
    )


@app.route("/api/notifications/read", methods=["POST"])
@api_login_required
def api_notifications_read():
    user = current_user()
    data = request.get_json(silent=True) or {}
    note_id = (data.get("id") or "").strip()
    mark_all = bool(data.get("all"))

    items = load_notifications()
    changed = False
    for note in items:
        if note.get("user_id") != user["id"]:
            continue
        if mark_all or (note_id and note.get("id") == note_id):
            if not note.get("read"):
                note["read"] = True
                changed = True
    if changed:
        save_notifications(items)

    unread = sum(
        1
        for n in items
        if n.get("user_id") == user["id"] and not n.get("read")
    )
    return jsonify({"ok": True, "unread": unread})


@app.route("/api/my/analytics")
@api_login_required
def api_my_analytics():
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403

    sid = company_id(user)
    if not sid:
        return jsonify({"ok": False, "error": "Компания не найдена"}), 403
    items = load_requests()
    inbound = [r for r in items if sid in (r.get("supplier_ids") or [])]
    offered = []
    won = 0
    lost = 0
    response_secs = []

    for r in inbound:
        my_offer = next(
            (o for o in (r.get("offers") or []) if o.get("supplier_id") == sid),
            None,
        )
        if my_offer:
            offered.append(r)
            created = parse_iso(r.get("created_at"))
            offered_at = parse_iso(my_offer.get("created_at"))
            if created and offered_at:
                response_secs.append(max(0, (offered_at - created).total_seconds()))
        status = r.get("status") or "sent"
        is_party = r.get("accepted_supplier_id") == sid
        if status in ("deal", "completed") and is_party:
            won += 1
        elif status in ("deal", "completed") and my_offer and not is_party:
            lost += 1

    decided = won + lost
    win_rate = round((won / decided) * 100, 1) if decided else None
    avg_response = None
    if response_secs:
        avg_response = int(sum(response_secs) / len(response_secs))

    return jsonify(
        {
            "ok": True,
            "stats": {
                "requests_total": len(inbound),
                "offers_sent": len(offered),
                "won": won,
                "lost": lost,
                "win_rate": win_rate,
                "avg_response_seconds": avg_response,
                "in_deal": sum(
                    1
                    for r in inbound
                    if r.get("status") == "deal" and r.get("accepted_supplier_id") == sid
                ),
            },
        }
    )


@app.route("/api/my/offer-templates", methods=["GET", "POST"])
@api_login_required
def api_offer_templates():
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403

    cid = company_id(user)
    users, index = find_user_index(cid)
    if index < 0:
        return jsonify({"ok": False, "error": "Компания не найдена"}), 401
    supplier = users[index].setdefault("supplier", {})
    templates = supplier.setdefault("offer_templates", [])
    if not isinstance(templates, list):
        templates = []
        supplier["offer_templates"] = templates

    if request.method == "GET":
        return jsonify({"ok": True, "items": templates})

    if not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Шаблоны меняет только руководитель"}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip() or "Шаблон"
    tpl = {
        "id": str(uuid.uuid4()),
        "name": name[:80],
        "price": str(data.get("price") or "").strip()[:80],
        "term": str(data.get("term") or "").strip()[:120],
        "delivery": str(data.get("delivery") or "").strip()[:120],
        "message": str(data.get("message") or "").strip()[:500],
        "created_at": now_iso(),
    }
    templates.append(tpl)
    if len(templates) > 20:
        supplier["offer_templates"] = templates[-20:]
    save_users(users)
    return jsonify({"ok": True, "item": tpl, "items": supplier["offer_templates"]})


@app.route("/api/my/offer-templates/<template_id>", methods=["DELETE"])
@api_login_required
def api_offer_template_delete(template_id):
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Только для поставщика"}), 403
    if not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Шаблоны меняет только руководитель"}), 403
    cid = company_id(user)
    users, index = find_user_index(cid)
    if index < 0:
        return jsonify({"ok": False, "error": "Компания не найдена"}), 401
    supplier = users[index].setdefault("supplier", {})
    templates = supplier.get("offer_templates") or []
    supplier["offer_templates"] = [t for t in templates if t.get("id") != template_id]
    save_users(users)
    return jsonify({"ok": True, "items": supplier["offer_templates"]})


# --- Команда поставщика (invite / members / activity) ---


@app.route("/api/team/invite", methods=["POST"])
@api_login_required
def api_team_invite():
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Приглашения создаёт только руководитель"}), 403

    owner = find_user_by_id(user["id"])
    if not owner:
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 401

    token = secrets.token_urlsafe(24)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=INVITE_TTL_SEC)
    ).isoformat().replace("+00:00", "Z")
    inv = {
        "token": token,
        "created_at": now_iso(),
        "expires_at": expires_at,
        "used_by": None,
    }
    invites = owner.setdefault("invites", [])
    if not isinstance(invites, list):
        invites = []
    invites.append(inv)
    owner["invites"] = invites[-30:]
    owner.setdefault("supplier_role", "owner")
    save_user(owner)

    path = f"/register?invite={token}"
    invite_url = shareable_url(path)

    return jsonify(
        {
            "ok": True,
            "token": token,
            "invite_url": invite_url,
            "expires_at": expires_at,
            "message": "Ссылка для менеджера создана (откройте с телефона в той же Wi‑Fi)",
        }
    )


@app.route("/api/team/invite/<token>", methods=["GET"])
def api_team_invite_info(token):
    owner, inv, _ = find_invite(token)
    if not owner or not invite_is_valid(inv):
        return jsonify({"ok": False, "error": "Ссылка недействительна или устарела"}), 404
    company = (owner.get("supplier") or {}).get("company_name") or owner.get("name") or ""
    return jsonify(
        {
            "ok": True,
            "company_name": company,
            "owner_name": owner.get("name") or "",
            "expires_at": inv.get("expires_at"),
        }
    )


@app.route("/api/team/members", methods=["GET"])
@api_login_required
def api_team_members():
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Только для руководителя"}), 403

    cid = user["id"]
    reqs = load_requests()
    members = []
    owner_row = {
        "id": user["id"],
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "supplier_role": "owner",
        "blocked": bool(user.get("blocked")),
        "created_at": user.get("created_at") or "",
    }
    owner_row.update(presence_payload(user, cid, reqs))
    members.append(owner_row)
    for u in load_users():
        if (
            u.get("role") == "supplier"
            and supplier_role_of(u) == "manager"
            and (u.get("company_supplier_id") or "") == cid
        ):
            row = {
                "id": u["id"],
                "name": u.get("name") or "",
                "email": u.get("email") or "",
                "supplier_role": "manager",
                "blocked": bool(u.get("blocked")),
                "created_at": u.get("created_at") or "",
            }
            row.update(presence_payload(u, cid, reqs))
            members.append(row)
    return jsonify({"ok": True, "items": members})


@app.route("/api/presence", methods=["POST"])
@api_login_required
def api_presence_heartbeat():
    """Heartbeat: пользователь онлайн (и опционально «в процессе»)."""
    user = current_user()
    touch_user_presence(user["id"])
    # вернуть свежий статус для себя
    fresh = find_user_by_id(user["id"]) or user
    cid = company_id(fresh)
    payload = {"ok": True}
    if fresh.get("role") == "supplier" and cid:
        payload.update(presence_payload(fresh, cid))
    else:
        payload.update(
            {
                "presence": "online",
                "online": True,
                "in_process": False,
                "active_deals": 0,
                "last_seen_at": fresh.get("last_seen_at") or now_iso(),
            }
        )
    return jsonify(payload)


@app.route("/api/team/members/<member_id>/block", methods=["POST"])
@api_login_required
def api_team_member_block(member_id):
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Только для руководителя"}), 403
    if member_id == user["id"]:
        return jsonify({"ok": False, "error": "Нельзя заблокировать себя"}), 400

    data = request.get_json(silent=True) or {}
    blocked = bool(data.get("blocked", True))

    member = find_user_by_id(member_id)
    if not member:
        return jsonify({"ok": False, "error": "Сотрудник не найден"}), 404
    if (
        member.get("role") != "supplier"
        or supplier_role_of(member) != "manager"
        or (member.get("company_supplier_id") or "") != user["id"]
    ):
        return jsonify({"ok": False, "error": "Можно менять только своих менеджеров"}), 403

    member["blocked"] = blocked
    save_user(member)
    return jsonify(
        {
            "ok": True,
            "message": "Менеджер заблокирован" if blocked else "Менеджер разблокирован",
            "member": {
                "id": member["id"],
                "name": member.get("name"),
                "email": member.get("email"),
                "blocked": blocked,
                "supplier_role": "manager",
            },
        }
    )


@app.route("/api/team/activity", methods=["GET"])
@api_login_required
def api_team_activity():
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Только для руководителя"}), 403

    cid = user["id"]
    events = []
    for r in load_requests():
        if cid not in (r.get("supplier_ids") or []):
            continue
        rid = r.get("id")
        short = (r.get("text") or "")[:80]
        for o in r.get("offers") or []:
            if o.get("supplier_id") != cid:
                continue
            events.append(
                {
                    "type": "offer",
                    "request_id": rid,
                    "request_text": short,
                    "price": o.get("price"),
                    "acted_by": o.get("acted_by"),
                    "acted_by_name": o.get("acted_by_name") or "",
                    "acted_by_role": o.get("acted_by_role") or "",
                    "created_at": o.get("created_at") or "",
                }
            )
        for m in r.get("deal_messages") or []:
            if m.get("role") != "supplier":
                continue
            if m.get("acted_by") or m.get("sender_id"):
                # сообщение от сотрудника компании (sender может быть manager id)
                sender = m.get("acted_by") or m.get("sender_id")
                # include if sender is owner or manager of this company
                su = find_user_by_id(sender) if sender else None
                if not su or company_id(su) != cid:
                    continue
            events.append(
                {
                    "type": "message",
                    "request_id": rid,
                    "request_text": short,
                    "text": (m.get("text") or "")[:120],
                    "acted_by": m.get("acted_by") or m.get("sender_id"),
                    "acted_by_name": m.get("acted_by_name") or m.get("sender_name") or "",
                    "acted_by_role": m.get("acted_by_role") or "",
                    "created_at": m.get("created_at") or "",
                }
            )

    events.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    limit = min(int(request.args.get("limit") or 50), 100)
    return jsonify({"ok": True, "items": events[:limit]})


def _oversee_stage(item, offer):
    status = item.get("status") or "sent"
    if status == "completed":
        return "completed"
    if status == "deal":
        return "deal"
    if not offer:
        return "waiting"
    ost = offer.get("status") or "active"
    if ost == "counter":
        return "counter"
    if ost == "rejected":
        return "rejected"
    return "offered"


def _oversee_build_case(item, cid, users_by_id):
    offer = next((o for o in (item.get("offers") or []) if o.get("supplier_id") == cid), None)
    stage = _oversee_stage(item, offer)
    actor_id = (offer or {}).get("acted_by") or ""
    actor = users_by_id.get(actor_id) if actor_id else None
    manager_name = (offer or {}).get("acted_by_name") or ""
    manager_role = (offer or {}).get("acted_by_role") or ""
    if actor:
        manager_name = manager_name or actor.get("name") or ""
        manager_role = manager_role or supplier_role_of(actor)

    messages = item.get("deal_messages") or []
    last_msg = messages[-1] if messages else None
    last_event = None
    if last_msg:
        last_event = {
            "type": "message",
            "side": last_msg.get("role") or "",
            "text": (last_msg.get("text") or "")[:140],
            "name": last_msg.get("acted_by_name")
            or last_msg.get("sender_name")
            or "",
            "at": last_msg.get("created_at") or "",
        }
    elif offer:
        last_event = {
            "type": "offer",
            "side": "supplier",
            "text": offer.get("price") or "",
            "name": manager_name,
            "at": offer.get("updated_at") or offer.get("created_at") or "",
        }
    else:
        last_event = {
            "type": "request",
            "side": "user",
            "text": (item.get("text") or "")[:140],
            "name": item.get("user_name") or "",
            "at": item.get("created_at") or "",
        }

    updated = (
        (last_event or {}).get("at")
        or item.get("updated_at")
        or item.get("created_at")
        or ""
    )
    short = (item.get("text") or "").split("Уточнения:")[0].strip()[:120]
    return {
        "request_id": item.get("id"),
        "stage": stage,
        "status": item.get("status") or "sent",
        "client_id": item.get("user_id") or "",
        "client_name": item.get("user_name") or "",
        "text": short,
        "manager_id": actor_id,
        "manager_name": manager_name,
        "manager_role": manager_role,
        "price": (offer or {}).get("price") or "",
        "term": (offer or {}).get("term") or "",
        "offer_status": (offer or {}).get("status") or "",
        "messages_count": len(messages),
        "updated_at": updated,
        "created_at": item.get("created_at") or "",
        "last_event": last_event,
        "has_offer": bool(offer),
    }


def _oversee_timeline(item, cid, users_by_id):
    timeline = []
    timeline.append(
        {
            "kind": "request",
            "side": "user",
            "title": "request",
            "name": item.get("user_name") or "",
            "text": (item.get("text") or "").split("Уточнения:")[0].strip()[:200],
            "at": item.get("created_at") or "",
        }
    )
    offer = next((o for o in (item.get("offers") or []) if o.get("supplier_id") == cid), None)
    if offer:
        timeline.append(
            {
                "kind": "offer",
                "side": "supplier",
                "title": "offer",
                "name": offer.get("acted_by_name") or "",
                "role": offer.get("acted_by_role") or "",
                "text": offer.get("price") or "",
                "meta": {
                    "term": offer.get("term") or "",
                    "delivery": offer.get("delivery") or "",
                    "message": (offer.get("message") or "")[:160],
                },
                "at": offer.get("created_at") or "",
            }
        )
        if offer.get("status") == "counter":
            timeline.append(
                {
                    "kind": "counter",
                    "side": "user",
                    "title": "counter",
                    "name": item.get("user_name") or "",
                    "text": offer.get("counter_price") or "",
                    "meta": {"message": (offer.get("counter_message") or "")[:160]},
                    "at": offer.get("updated_at") or offer.get("created_at") or "",
                }
            )
        if offer.get("status") == "rejected":
            timeline.append(
                {
                    "kind": "rejected",
                    "side": "user",
                    "title": "rejected",
                    "name": item.get("user_name") or "",
                    "text": offer.get("reject_reason") or "",
                    "at": offer.get("updated_at") or "",
                }
            )
    if item.get("accepted_offer_id") and offer and item.get("accepted_offer_id") == offer.get("id"):
        timeline.append(
            {
                "kind": "accepted",
                "side": "user",
                "title": "accepted",
                "name": item.get("user_name") or "",
                "text": offer.get("price") or "",
                "at": item.get("deal_started_at") or item.get("updated_at") or "",
            }
        )
    for m in item.get("deal_messages") or []:
        side = m.get("role") or "user"
        name = m.get("acted_by_name") or m.get("sender_name") or ""
        if side == "supplier" and not name:
            su = find_user_by_id(m.get("acted_by") or m.get("sender_id") or "")
            if su:
                name = su.get("name") or ""
        if side == "user" and not name:
            name = item.get("user_name") or ""
        timeline.append(
            {
                "kind": "message",
                "side": side,
                "title": "message",
                "name": name,
                "role": m.get("acted_by_role") or "",
                "text": (m.get("text") or "")[:400],
                "at": m.get("created_at") or "",
            }
        )
    if (item.get("status") or "") == "completed":
        timeline.append(
            {
                "kind": "completed",
                "side": "system",
                "title": "completed",
                "name": "",
                "text": "",
                "at": item.get("completed_at") or item.get("updated_at") or "",
            }
        )
    timeline.sort(key=lambda e: e.get("at") or "")
    return timeline


@app.route("/api/team/oversee", methods=["GET"])
@api_login_required
def api_team_oversee():
    """Живой контроль процессов менеджер ↔ клиент (только владелец)."""
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Только для руководителя"}), 403

    cid = user["id"]
    users_by_id = {u["id"]: u for u in load_users()}
    all_requests = load_requests()
    stage_filter = (request.args.get("stage") or "").strip().lower()
    manager_filter = (request.args.get("manager_id") or "").strip()

    cases = []
    for r in all_requests:
        if not supplier_can_see_request(r, cid):
            continue
        case = _oversee_build_case(r, cid, users_by_id)
        if stage_filter and case["stage"] != stage_filter:
            continue
        if manager_filter:
            if manager_filter == "owner":
                if case.get("manager_role") == "manager":
                    continue
            elif case.get("manager_id") != manager_filter:
                continue
        cases.append(case)

    cases.sort(key=lambda c: c.get("updated_at") or "", reverse=True)

    stats = {
        "waiting": sum(1 for c in cases if c["stage"] == "waiting"),
        "offered": sum(1 for c in cases if c["stage"] == "offered"),
        "counter": sum(1 for c in cases if c["stage"] == "counter"),
        "deal": sum(1 for c in cases if c["stage"] == "deal"),
        "completed": sum(1 for c in cases if c["stage"] == "completed"),
        "rejected": sum(1 for c in cases if c["stage"] == "rejected"),
        "total": len(cases),
    }

    managers = []
    for u in users_by_id.values():
        if u.get("role") != "supplier":
            continue
        if company_id(u) != cid:
            continue
        row = {
            "id": u["id"],
            "name": u.get("name") or u.get("email") or "",
            "role": supplier_role_of(u) or "owner",
            "blocked": bool(u.get("blocked")),
        }
        row.update(presence_payload(u, cid, all_requests))
        managers.append(row)
    managers.sort(key=lambda m: (0 if m["role"] == "owner" else 1, m["name"].lower()))

    presence_by_id = {m["id"]: m for m in managers}
    for case in cases:
        mid = case.get("manager_id") or ""
        info = presence_by_id.get(mid) or {}
        case["manager_presence"] = info.get("presence") or "offline"
        case["manager_online"] = bool(info.get("online"))

    return jsonify(
        {
            "ok": True,
            "stats": stats,
            "managers": managers,
            "items": cases[:120],
        }
    )


@app.route("/api/team/oversee/<request_id>", methods=["GET"])
@api_login_required
def api_team_oversee_detail(request_id):
    """Полный таймлайн одного процесса для руководителя."""
    user = current_user()
    if user["role"] != "supplier" or not is_supplier_owner(user):
        return jsonify({"ok": False, "error": "Только для руководителя"}), 403

    cid = user["id"]
    _items, _idx, target = find_request(request_id)
    if not target or not supplier_can_see_request(target, cid):
        return jsonify({"ok": False, "error": "Процесс не найден"}), 404

    users_by_id = {u["id"]: u for u in load_users()}
    case = _oversee_build_case(target, cid, users_by_id)
    timeline = _oversee_timeline(target, cid, users_by_id)
    mid = case.get("manager_id") or ""
    actor = users_by_id.get(mid) if mid else None
    if actor:
        p = presence_payload(actor, cid)
        case["manager_presence"] = p.get("presence") or "offline"
        case["manager_online"] = bool(p.get("online"))
        case["manager_active_deals"] = p.get("active_deals") or 0
    else:
        case["manager_presence"] = "offline"
        case["manager_online"] = False
        case["manager_active_deals"] = 0
    return jsonify({"ok": True, "item": case, "timeline": timeline})


# --- Жизненный цикл заявки (create, offer, accept, chat, complete, rate) ---


@app.route("/api/requests", methods=["GET", "POST"])
@api_login_required
def api_requests():
    """Список заявок для зрителя или создание новой заявки покупателя."""
    user = current_user()

    if request.method == "GET":
        maybe_deadline_reminders()
        items = load_requests()
        status = (request.args.get("status") or "").strip()
        view = (request.args.get("view") or "").strip().lower()
        if user["role"] == "user":
            mine = [r for r in items if r["user_id"] == user["id"]]
        else:
            cid = company_id(user)
            mine = [
                r
                for r in items
                if cid and supplier_can_see_request(r, cid)
            ]
        if view == "summary":
            prepared = [enrich_request(r, user) for r in mine]
            active = [r for r in prepared if (r.get("status") or "sent") == "sent"]
            deals = [r for r in prepared if r.get("status") == "deal"]
            history = [r for r in prepared if r.get("status") in ("completed", "cancelled")]
            active.sort(key=lambda r: r.get("created_at", ""), reverse=True)
            deals.sort(key=lambda r: r.get("created_at", ""), reverse=True)
            history.sort(key=lambda r: r.get("created_at", ""), reverse=True)
            return jsonify(
                {
                    "ok": True,
                    "active": active,
                    "deals": deals,
                    "history": history,
                    "deadline_hours": OFFER_DEADLINE_HOURS,
                }
            )
        if status:
            mine = [r for r in mine if (r.get("status") or "sent") == status]
        mine = sorted(mine, key=lambda r: r.get("created_at", ""), reverse=True)
        return jsonify(
            {
                "ok": True,
                "items": [enrich_request(r, user) for r in mine],
                "deadline_hours": OFFER_DEADLINE_HOURS,
            }
        )

    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Заявки создаёт только пользователь"}), 403

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    answers = data.get("answers") or {}
    confirm = bool(data.get("confirm"))
    target_supplier_id = str(data.get("supplier_id") or "").strip()
    product_id = str(data.get("product_id") or "").strip()
    product = None
    if product_id:
        catalog = load_catalog()
        product = next(
            (p for p in (catalog.get("products") or []) if p.get("id") == product_id),
            None,
        )
        if not product:
            return jsonify({"ok": False, "error": "Товар не найден"}), 404
        target_supplier_id = str(product.get("supplier_id") or target_supplier_id).strip()
        if not text:
            unit = product.get("unit") or "шт"
            text = f"Нужно: {product.get('name') or 'товар'} · {unit}"
        if product.get("category"):
            answers = {**answers, "category_hint": product.get("category")}

    if len(text) < 3:
        return jsonify({"ok": False, "error": "Опишите, что вам нужно"}), 400

    analysis = analyze_request(text, answers)
    if product:
        analysis = dict(analysis)
        items = list(analysis.get("items") or [])
        if items:
            items[0] = {
                **items[0],
                "name": product.get("name") or items[0].get("name"),
                "category": product.get("category") or items[0].get("category"),
                "preferred_supplier_id": product.get("supplier_id"),
                "product_id": product.get("id"),
            }
            analysis["items"] = items
        cats = list(analysis.get("categories") or [])
        if product.get("category") and product.get("category") not in cats:
            cats = [product.get("category")] + cats
            analysis["categories"] = cats

    if analysis["needs_clarification"] and not confirm and not product_id:
        return jsonify(
            {
                "ok": True,
                "needs_clarification": True,
                "analysis": analysis,
                "message": "Нужно уточнить детали перед отправкой",
                "supplier_id": target_supplier_id or None,
            }
        )

    final_text = compose_final_text(text, analysis.get("answers") or answers)
    direct = False
    if target_supplier_id:
        target = find_user_by_id(target_supplier_id)
        if not target or not is_matchable_supplier(target):
            return jsonify({"ok": False, "error": "Поставщик не найден"}), 404
        suppliers = [public_supplier(target)]
        categories = analysis.get("categories") or []
        cat = ""
        for c in supplier_categories(target.get("supplier") or {}):
            if c not in categories:
                categories = [c] + categories
            if not cat:
                cat = c
        direct = True
    else:
        categories, _match_summary, suppliers = match_suppliers_from_analysis(analysis)

    summary = analysis["summary"]
    if not suppliers:
        return jsonify(
            {
                "ok": False,
                "error": "Не удалось найти подходящих поставщиков. Уточните запрос.",
                "summary": summary,
                "categories": categories,
                "analysis": analysis,
            }
        ), 404

    created = now_iso()
    expires = (
        datetime.now(timezone.utc) + timedelta(hours=OFFER_DEADLINE_HOURS)
    ).isoformat().replace("+00:00", "Z")
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "text": final_text,
        "matched_categories": categories,
        "items": analysis.get("items") or [],
        "details": analysis.get("answers") or answers or {},
        "summary": summary,
        "supplier_ids": [s["id"] for s in suppliers],
        "direct_supplier_id": target_supplier_id or None,
        "product_id": product_id or None,
        "status": "sent",
        "created_at": created,
        "expires_at": expires,
        "offers": [],
        "accepted_offer_id": None,
    }
    save_request(item)
    track_event(
        "request_created",
        path="/api/requests",
        meta={
            "request_id": item["id"],
            "suppliers": len(item.get("supplier_ids") or []),
            "direct": bool(direct),
        },
    )

    buyer_label = user.get("name") or "Покупатель"
    snippet = (final_text[:120] + "…") if len(final_text) > 120 else final_text
    notify_many(
        expand_company_notify_ids(item["supplier_ids"]),
        "new_request",
        "Новая заявка",
        f"{buyer_label}: {snippet}",
        request_id=item["id"],
    )

    if direct:
        company = suppliers[0].get("company_name") or "поставщику"
        msg = f"Заявка отправлена напрямую: {company}"
    else:
        msg = f"Заявка отправлена {len(suppliers)} поставщикам"

    return jsonify(
        {
            "ok": True,
            "needs_clarification": False,
            "message": msg,
            "request": enrich_request(item, user),
            "analysis": analysis,
        }
    )


@app.route("/api/requests/<request_id>/offer", methods=["POST"])
@api_login_required
def api_request_offer(request_id):
    user = current_user()
    if user["role"] != "supplier":
        return jsonify({"ok": False, "error": "Цену указывает только поставщик"}), 403

    cid = company_id(user)
    if not cid:
        return jsonify({"ok": False, "error": "Компания не найдена"}), 403

    data = request.get_json(silent=True) or {}
    price = (data.get("price") or "").strip()
    message = (data.get("message") or "").strip()
    term = (data.get("term") or "").strip()[:120]
    delivery = (data.get("delivery") or "").strip()[:120]
    if not price:
        return jsonify({"ok": False, "error": "Укажите цену"}), 400

    items = load_requests()
    target = None
    for item in items:
        if item["id"] == request_id:
            target = item
            break
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if target.get("status") in ("deal", "completed", "cancelled"):
        return jsonify({"ok": False, "error": "Заявка уже в согласовании, завершена или отменена"}), 400
    if cid not in target.get("supplier_ids", []):
        return jsonify({"ok": False, "error": "Эта заявка вам не назначена"}), 403

    ensure_request_expiry(target)
    already = supplier_has_offer(target, cid)
    deadline = offer_deadline_info(target)
    if not already and deadline.get("offer_expired"):
        return jsonify(
            {
                "ok": False,
                "error": f"Срок ответа истёк ({OFFER_DEADLINE_HOURS} ч). Заявка для вас закрыта.",
                "offer_expired": True,
            }
        ), 400

    offers = target.setdefault("offers", [])
    existing = next((o for o in offers if o["supplier_id"] == cid), None)
    offer = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "supplier_id": cid,
        "price": price,
        "term": term,
        "delivery": delivery,
        "message": message,
        "created_at": now_iso(),
        "status": "active",
        **actor_fields(user),
    }
    if existing:
        offers[offers.index(existing)] = offer
    else:
        offers.append(offer)

    save_request(target)
    track_event(
        "offer_sent",
        path=f"/api/requests/{request_id}/offer",
        meta={"request_id": request_id, "price": price},
    )

    company = company_supplier_profile(user).get("company_name") or user.get("name") or "Поставщик"
    offer_title = "Новое предложение с ценой"
    offer_body = f"{company}: {price} ₸"
    add_notification(
        target.get("user_id"),
        "new_offer",
        offer_title,
        offer_body,
        request_id=target["id"],
    )
    email_user(target.get("user_id"), offer_title, offer_body, request_id=target["id"])

    return jsonify(
        {
            "ok": True,
            "message": "Предложение отправлено пользователю",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/accept", methods=["POST"])
@api_login_required
def api_request_accept(request_id):
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Выбрать поставщика может только пользователь"}), 403

    data = request.get_json(silent=True) or {}
    offer_id = (data.get("offer_id") or "").strip()
    if not offer_id:
        return jsonify({"ok": False, "error": "Выберите предложение"}), 400

    items, index, target = find_request(request_id)
    if not target or target.get("user_id") != user["id"]:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if target.get("status") in ("deal", "completed", "cancelled"):
        return jsonify({"ok": False, "error": "Поставщик уже выбран или заявка закрыта"}), 400

    offer = next((o for o in target.get("offers", []) if o["id"] == offer_id), None)
    if not offer:
        return jsonify({"ok": False, "error": "Предложение не найдено"}), 404
    if offer.get("status") == "rejected":
        return jsonify({"ok": False, "error": "Это предложение отклонено"}), 400

    users_by_id = {u["id"]: u for u in load_users()}
    supplier_user = users_by_id.get(offer["supplier_id"])
    company = ""
    if supplier_user:
        company = (supplier_user.get("supplier") or {}).get("company_name") or supplier_user.get("name") or "Поставщик"

    target["status"] = "deal"
    target["accepted_offer_id"] = offer_id
    target["accepted_supplier_id"] = offer["supplier_id"]
    target["deal_confirmations"] = []
    target["deal_started_at"] = now_iso()
    target["deal_messages"] = [
        {
            "id": str(uuid.uuid4()),
            "role": "system",
            "sender_id": None,
            "sender_name": "HupHup",
            "text": (
                f"Пользователь выбрал {company} (цена {offer.get('price')} ₸). "
                "Начните согласование условий в этом чате."
            ),
            "created_at": now_iso(),
        }
    ]
    items[index] = target
    save_request(target)

    add_notification(
        offer["supplier_id"],
        "offer_accepted",
        "Вас выбрали для сделки",
        f"Покупатель принял цену {offer.get('price')} ₸. Откройте чат согласования.",
        request_id=target["id"],
    )
    # уведомить всю команду компании
    for uid in team_member_ids(offer["supplier_id"]):
        if uid == offer["supplier_id"]:
            continue
        add_notification(
            uid,
            "offer_accepted",
            "Компанию выбрали для сделки",
            f"Покупатель принял цену {offer.get('price')} ₸. Откройте чат согласования.",
            request_id=target["id"],
        )

    return jsonify(
        {
            "ok": True,
            "message": "Поставщик выбран — откройте чат согласования",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>", methods=["GET"])
@api_login_required
def api_request_get(request_id):
    user = current_user()
    _items, _index, target = find_request(request_id)
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404

    if user["role"] == "user":
        if target.get("user_id") != user["id"]:
            return jsonify({"ok": False, "error": "Нет доступа к заявке"}), 403
    else:
        cid = company_id(user)
        if not cid or not supplier_can_see_request(target, cid):
            return jsonify({"ok": False, "error": "Нет доступа к заявке"}), 403

    return jsonify({"ok": True, "request": enrich_request(target, user)})


@app.route("/api/requests/<request_id>/cancel", methods=["POST"])
@api_login_required
def api_request_cancel(request_id):
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Отменить может только покупатель"}), 403

    items, index, target = find_request(request_id)
    if not target or target.get("user_id") != user["id"]:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if (target.get("status") or "sent") != "sent":
        return jsonify({"ok": False, "error": "Отменить можно только заявку в ожидании цен"}), 400

    target["status"] = "cancelled"
    target["cancelled_at"] = now_iso()
    items[index] = target
    save_request(target)

    short = (target.get("text") or "")[:80]
    notify_many(
        expand_company_notify_ids(target.get("supplier_ids") or []),
        "request_cancelled",
        "Заявка отменена",
        f"Покупатель отозвал заявку: {short}",
        request_id=target["id"],
    )

    return jsonify(
        {
            "ok": True,
            "message": "Заявка отменена",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/reject", methods=["POST"])
@api_login_required
def api_request_reject(request_id):
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Отклонить может только покупатель"}), 403

    data = request.get_json(silent=True) or {}
    offer_id = (data.get("offer_id") or "").strip()
    reason = (data.get("reason") or "").strip()[:200]
    reason_code = (data.get("reason_code") or "").strip()[:40]
    if not offer_id:
        return jsonify({"ok": False, "error": "Выберите предложение"}), 400

    items, index, target = find_request(request_id)
    if not target or target.get("user_id") != user["id"]:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if (target.get("status") or "sent") != "sent":
        return jsonify({"ok": False, "error": "Заявка уже закрыта для отклонения"}), 400

    offer = next((o for o in target.get("offers", []) if o["id"] == offer_id), None)
    if not offer:
        return jsonify({"ok": False, "error": "Предложение не найдено"}), 404

    presets = {
        "expensive": "Дорого",
        "terms": "Не подходят условия",
        "other": "Другое",
    }
    label = presets.get(reason_code) or reason or "Отклонено"
    if reason_code == "other" and reason:
        label = reason
    elif reason and reason_code != "expensive" and reason_code != "terms":
        label = reason

    offer["status"] = "rejected"
    offer["reject_reason"] = label
    offer["rejected_at"] = now_iso()
    offer.pop("counter_price", None)
    offer.pop("counter_message", None)
    items[index] = target
    save_request(target)

    add_notification(
        offer["supplier_id"],
        "offer_rejected",
        "Предложение отклонено",
        f"Причина: {label}. Можете обновить цену в кабинете.",
        request_id=target["id"],
    )

    return jsonify(
        {
            "ok": True,
            "message": "Предложение отклонено",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/counter", methods=["POST"])
@api_login_required
def api_request_counter(request_id):
    user = current_user()
    if user["role"] != "user":
        return jsonify({"ok": False, "error": "Контрпредложение может отправить только покупатель"}), 403

    data = request.get_json(silent=True) or {}
    offer_id = (data.get("offer_id") or "").strip()
    counter_price = (data.get("price") or "").strip()[:80]
    counter_message = (data.get("message") or "").strip()[:500]
    if not offer_id:
        return jsonify({"ok": False, "error": "Выберите предложение"}), 400
    if not counter_price and not counter_message:
        return jsonify({"ok": False, "error": "Укажите желаемую цену или комментарий"}), 400

    items, index, target = find_request(request_id)
    if not target or target.get("user_id") != user["id"]:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if (target.get("status") or "sent") != "sent":
        return jsonify({"ok": False, "error": "Заявка уже закрыта"}), 400

    offer = next((o for o in target.get("offers", []) if o["id"] == offer_id), None)
    if not offer:
        return jsonify({"ok": False, "error": "Предложение не найдено"}), 404
    if offer.get("status") == "rejected":
        return jsonify({"ok": False, "error": "Сначала обновите — предложение отклонено"}), 400

    offer["status"] = "counter"
    offer["counter_price"] = counter_price
    offer["counter_message"] = counter_message
    offer["counter_at"] = now_iso()
    items[index] = target
    save_request(target)

    body_bits = []
    if counter_price:
        body_bits.append(f"желаемая цена: {counter_price} ₸")
    if counter_message:
        body_bits.append(counter_message)
    add_notification(
        offer["supplier_id"],
        "offer_counter",
        "Контрпредложение от покупателя",
        " · ".join(body_bits) or "Обновите своё предложение",
        request_id=target["id"],
    )

    return jsonify(
        {
            "ok": True,
            "message": "Контрпредложение отправлено поставщику",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/messages", methods=["GET", "POST"])
@api_login_required
def api_request_messages(request_id):
    user = current_user()
    items, index, target = find_request(request_id)
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if not can_access_deal(target, user):
        return jsonify({"ok": False, "error": "Чат доступен только выбранным сторонам"}), 403

    if request.method == "GET":
        return jsonify(
            {
                "ok": True,
                "status": target.get("status"),
                "messages": target.get("deal_messages") or [],
                "request": enrich_request(target, user),
            }
        )

    if target.get("status") != "deal":
        return jsonify({"ok": False, "error": "Сделка уже завершена"}), 400

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    attachment_id = (data.get("attachment_id") or "").strip()
    if not text and not attachment_id:
        return jsonify({"ok": False, "error": "Введите сообщение или прикрепите файл"}), 400
    if len(text) > 2000:
        return jsonify({"ok": False, "error": "Слишком длинное сообщение"}), 400

    attachment_payload = None
    if attachment_id:
        pending = (target.get("file_attachments") or {}).get(attachment_id)
        if not pending:
            return jsonify({"ok": False, "error": "Вложение не найдено"}), 404
        if pending.get("used"):
            return jsonify({"ok": False, "error": "Вложение уже отправлено"}), 400
        attachment_payload = {
            "id": attachment_id,
            "name": pending.get("name") or "file",
            "mime": pending.get("mime") or "application/octet-stream",
            "size": pending.get("size") or 0,
            "url": f"/api/files/{attachment_id}",
        }
        pending["used"] = True

    role = "user" if user["role"] == "user" else "supplier"
    if user["role"] == "supplier":
        sender_name = company_supplier_profile(user).get("company_name") or user.get("name")
    else:
        sender_name = user.get("name") or "Пользователь"

    msg = {
        "id": str(uuid.uuid4()),
        "role": role,
        "sender_id": user["id"],
        "sender_name": sender_name,
        "text": text,
        "created_at": now_iso(),
        **(actor_fields(user) if user["role"] == "supplier" else {}),
    }
    if attachment_payload:
        msg["attachment"] = attachment_payload
    messages = target.setdefault("deal_messages", [])
    messages.append(msg)
    items[index] = target
    save_request(target)

    if user["role"] == "user":
        other_id = target.get("accepted_supplier_id")
    else:
        other_id = target.get("user_id")
    preview = text or (attachment_payload or {}).get("name") or "Файл"
    preview = (preview[:100] + "…") if len(preview) > 100 else preview
    add_notification(
        other_id,
        "deal_message",
        f"Сообщение от {sender_name}",
        preview,
        request_id=target["id"],
    )

    return jsonify(
        {
            "ok": True,
            "message": msg,
            "messages": messages,
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/attachments", methods=["POST"])
@api_login_required
def api_request_attachment_upload(request_id):
    """Загрузить файл для чата сделки (PDF/изображения, до 5 МБ)."""
    user = current_user()
    items, index, target = find_request(request_id)
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if not can_access_deal(target, user):
        return jsonify({"ok": False, "error": "Чат доступен только выбранным сторонам"}), 403
    if target.get("status") != "deal":
        return jsonify({"ok": False, "error": "Сделка уже завершена"}), 400

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify({"ok": False, "error": "Выберите файл"}), 400

    raw = upload.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        return jsonify({"ok": False, "error": "Файл слишком большой (макс. 5 МБ)"}), 400
    if not raw:
        return jsonify({"ok": False, "error": "Пустой файл"}), 400

    safe_name = secure_filename(upload.filename) or "file"
    mime = (upload.mimetype or "").split(";")[0].strip().lower()
    if not _allowed_upload(safe_name, mime):
        return jsonify({"ok": False, "error": "Допустимы PDF, PNG, JPG, WEBP"}), 400

    file_id = str(uuid.uuid4())
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else "bin"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    blob_path = UPLOAD_DIR / f"{file_id}.{ext}"
    blob_path.write_bytes(raw)

    meta = {
        "id": file_id,
        "request_id": request_id,
        "name": safe_name,
        "mime": mime or mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
        "size": len(raw),
        "uploaded_by": user["id"],
        "created_at": now_iso(),
        "blob": str(blob_path.name),
    }
    _save_upload_meta(meta)

    attachment = {
        "id": file_id,
        "name": safe_name,
        "mime": meta["mime"],
        "size": len(raw),
        "url": f"/api/files/{file_id}",
        "used": False,
    }
    target.setdefault("file_attachments", {})[file_id] = attachment
    items[index] = target
    save_request(target)

    return jsonify({"ok": True, "attachment": attachment})


@app.route("/api/files/<file_id>", methods=["GET"])
@api_login_required
def api_file_download(file_id):
    """Скачать вложение сделки (только стороны сделки)."""
    user = current_user()
    if not can_access_upload(file_id, user):
        return jsonify({"ok": False, "error": "Файл недоступен"}), 403
    meta = _load_upload_meta(file_id)
    if not meta:
        return jsonify({"ok": False, "error": "Файл не найден"}), 404
    blob_name = meta.get("blob")
    blob_path = UPLOAD_DIR / blob_name if blob_name else None
    if not blob_path or not blob_path.exists():
        return jsonify({"ok": False, "error": "Файл не найден"}), 404
    return send_file(
        blob_path,
        mimetype=meta.get("mime") or "application/octet-stream",
        as_attachment=False,
        download_name=meta.get("name") or blob_path.name,
    )


@app.route("/api/requests/<request_id>/complete", methods=["POST"])
@api_login_required
def api_request_complete(request_id):
    user = current_user()
    items, index, target = find_request(request_id)
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if not can_access_deal(target, user):
        return jsonify({"ok": False, "error": "Завершить может только сторона сделки"}), 403
    if target.get("status") != "deal":
        return jsonify({"ok": False, "error": "Сделка уже завершена"}), 400

    who = "Пользователь" if user["role"] == "user" else "Поставщик"
    if user["role"] == "supplier":
        who = (user.get("supplier") or {}).get("company_name") or user.get("name") or who

    confirmations = [str(uid) for uid in (target.get("deal_confirmations") or []) if uid]
    actor_id = str(user["id"])
    if actor_id in confirmations:
        return jsonify(
            {
                "ok": True,
                "message": "Вы уже подтвердили договорённость. Ожидаем вторую сторону.",
                "request": enrich_request(target, user),
            }
        )

    confirmations.append(actor_id)
    target["deal_confirmations"] = sorted(set(confirmations))
    messages = target.setdefault("deal_messages", [])
    messages.append(
        {
            "id": str(uuid.uuid4()),
            "role": "system",
            "sender_id": None,
            "sender_name": "HupHup",
            "text": f"{who} подтвердил(а) договорённость. Ожидаем подтверждение второй стороны.",
            "created_at": now_iso(),
        }
    )

    user_id = str(target.get("user_id") or "")
    supplier_id = str(target.get("accepted_supplier_id") or "")
    both_confirmed = bool(user_id and supplier_id and user_id in target["deal_confirmations"] and supplier_id in target["deal_confirmations"])

    if both_confirmed:
        target["status"] = "completed"
        target["completed_at"] = now_iso()
        target["completed_by"] = user["id"]
        messages.append(
            {
                "id": str(uuid.uuid4()),
                "role": "system",
                "sender_id": None,
                "sender_name": "HupHup",
                "text": "Обе стороны подтвердили договорённость. Сделка завершена.",
                "created_at": now_iso(),
            }
        )

    items[index] = target
    save_request(target)

    if user["role"] == "user":
        other_id = target.get("accepted_supplier_id")
    else:
        other_id = target.get("user_id")
    if both_confirmed:
        add_notification(
            other_id,
            "deal_completed",
            "Сделка завершена",
            "Обе стороны подтвердили договорённость.",
            request_id=target["id"],
        )
    else:
        add_notification(
            other_id,
            "deal_confirmed",
            "Нужно подтверждение сделки",
            f"{who} подтвердил(а) договорённость. Подтвердите со своей стороны.",
            request_id=target["id"],
        )

    return jsonify(
        {
            "ok": True,
            "message": "Сделка завершена" if both_confirmed else "Ваша сторона подтвердила. Ожидаем вторую сторону.",
            "request": enrich_request(target, user),
        }
    )


@app.route("/api/requests/<request_id>/rate", methods=["POST"])
@api_login_required
def api_request_rate(request_id):
    user = current_user()
    items, _index, target = find_request(request_id)
    if not target:
        return jsonify({"ok": False, "error": "Заявка не найдена"}), 404
    if target.get("status") != "completed":
        return jsonify({"ok": False, "error": "Оценить можно только завершённую сделку"}), 400
    if not can_access_deal(target, user):
        return jsonify({"ok": False, "error": "Оценить может только сторона сделки"}), 403

    if find_rating(request_id, user["id"]):
        return jsonify({"ok": False, "error": "Вы уже оценили эту сделку"}), 400

    if user["role"] == "user":
        to_user_id = target.get("accepted_supplier_id")
    else:
        to_user_id = target.get("user_id")
    if not to_user_id or to_user_id == user["id"]:
        return jsonify({"ok": False, "error": "Некому ставить оценку"}), 400

    data = request.get_json(silent=True) or {}
    try:
        score = int(data.get("score"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Укажите оценку от 1 до 5"}), 400
    if score < 1 or score > 5:
        return jsonify({"ok": False, "error": "Оценка должна быть от 1 до 5"}), 400

    comment = (data.get("comment") or "").strip()
    if len(comment) > 500:
        return jsonify({"ok": False, "error": "Комментарий слишком длинный"}), 400

    rating = {
        "id": str(uuid.uuid4()),
        "request_id": request_id,
        "from_user_id": user["id"],
        "to_user_id": to_user_id,
        "score": score,
        "comment": comment,
        "created_at": now_iso(),
    }
    ratings = load_ratings()
    ratings.append(rating)
    save_ratings(ratings)

    who = user.get("name") or "Участник"
    if user["role"] == "supplier":
        who = (user.get("supplier") or {}).get("company_name") or who
    add_notification(
        to_user_id,
        "new_rating",
        f"Новая оценка: {score} из 5",
        f"{who}" + (f": {comment}" if comment else ""),
        request_id=request_id,
    )

    return jsonify(
        {
            "ok": True,
            "message": "Оценка сохранена",
            "rating": rating,
            "request": enrich_request(target, user),
        }
    )


# --- Админка ---


@app.route("/admin")
@admin_required
def admin_page():
    user = current_user()
    return render_template(
        "admin_panel.html",
        user=user,
        avatar_initials=avatar_initials(user.get("name") or "A"),
        avatar_tone=avatar_tone(user.get("name") or "A"),
    )


@app.route("/admin-assets/<path:filename>")
def admin_panel_static(filename):
    """CSS/JS для новой админ-панели из папки admin_panel/static."""
    return send_from_directory(admin_panel_pkg.STATIC, filename)


@app.route("/api/admin/stats")
@api_admin_required
def api_admin_stats():
    if db_store.use_db():
        roles = db_store.user_role_counts()
        by_status = db_store.request_status_counts()
        return jsonify(
            {
                "ok": True,
                "stats": {
                    "users_total": roles.get("total", 0),
                    "buyers": roles.get("buyers", 0),
                    "suppliers": roles.get("suppliers", 0),
                    "admins": roles.get("admins", 0),
                    "blocked": roles.get("blocked", 0),
                    "requests_total": sum(by_status.values()) if by_status else db_store.count_requests(),
                    "requests_by_status": by_status,
                },
            }
        )
    users = load_users()
    requests_items = load_requests()
    buyers = sum(1 for u in users if u.get("role") == "user")
    suppliers = sum(1 for u in users if u.get("role") == "supplier")
    blocked = sum(1 for u in users if u.get("blocked"))
    by_status = {}
    for r in requests_items:
        st = r.get("status") or "sent"
        by_status[st] = by_status.get(st, 0) + 1
    return jsonify(
        {
            "ok": True,
            "stats": {
                "users_total": len(users),
                "buyers": buyers,
                "suppliers": suppliers,
                "admins": sum(1 for u in users if u.get("role") == "admin"),
                "blocked": blocked,
                "requests_total": len(requests_items),
                "requests_by_status": by_status,
            },
        }
    )


@app.route("/api/admin/filter-meta")
@api_admin_required
def api_admin_filter_meta():
    """Distinct values for admin filter dropdowns (all collections)."""
    users = [public_admin_user(u) for u in load_users() if u.get("role") != "admin"]
    requests_items = load_requests()
    catalog = load_catalog() or {}
    products = catalog.get("products") or []
    notifications = load_notifications()
    ratings = load_ratings()

    def uniq(values, limit=300):
        out = sorted({str(v).strip() for v in values if v is not None and str(v).strip()})
        return out[:limit]

    cities = uniq(u.get("city") for u in users)
    companies = uniq(u.get("company_name") for u in users)
    categories = uniq(
        list(CATEGORY_OPTIONS)
        + [u.get("category") for u in users]
        + [c for u in users for c in (u.get("categories") or [])]
        + [p.get("category") for p in products]
        + [c for r in requests_items for c in (r.get("matched_categories") or [])]
    )
    subcategories = uniq(p.get("subcategory") or p.get("subcategory_id") for p in products)
    units = uniq(p.get("unit") for p in products)
    notif_types = uniq(n.get("type") for n in notifications)
    banks = uniq(u.get("bank_name") for u in users)
    supplier_roles = uniq(u.get("supplier_role") for u in users if u.get("supplier_role"))
    scores = uniq(r.get("score") or r.get("rating") for r in ratings)

    return jsonify(
        {
            "ok": True,
            "meta": {
                "roles": ["user", "supplier"],
                "supplier_roles": supplier_roles or ["owner", "manager"],
                "blocked": ["0", "1"],
                "cities": cities,
                "companies": companies,
                "categories": categories,
                "subcategories": subcategories,
                "units": units,
                "banks": banks,
                "request_statuses": ["sent", "deal", "completed", "cancelled"],
                "notification_types": notif_types,
                "scores": scores,
                "has_options": ["", "1", "0"],
            },
            "counts": {
                "users": len(users),
                "requests": len(requests_items),
                "products": len(products),
                "notifications": len(notifications),
                "ratings": len(ratings),
            },
        }
    )


@app.route("/api/admin/users")
@api_admin_required
def api_admin_users():
    role = _admin_arg("role")
    q = _admin_arg_lower("q")
    blocked = _admin_arg("blocked")  # "", "1", "0"
    city = _admin_arg_lower("city")
    company = _admin_arg_lower("company")
    category = _admin_arg_lower("category")
    bin_q = _admin_arg_lower("bin")
    phone = _admin_arg_lower("phone")
    email = _admin_arg_lower("email")
    name = _admin_arg_lower("name")
    contact = _admin_arg_lower("contact_person")
    bank = _admin_arg_lower("bank")
    website = _admin_arg_lower("website")
    supplier_role = _admin_arg("supplier_role")
    has_bin = _admin_arg("has_bin")
    has_phone = _admin_arg("has_phone")
    created_from = _admin_arg("created_from")
    created_to = _admin_arg("created_to")
    id_q = _admin_arg_lower("id")

    items = []
    for u in load_users():
        if u.get("role") == "admin":
            continue
        row = public_admin_user(u)
        if role and row.get("role") != role:
            continue
        if blocked == "1" and not row.get("blocked"):
            continue
        if blocked == "0" and row.get("blocked"):
            continue
        if supplier_role and row.get("supplier_role") != supplier_role:
            continue
        if city and city not in (row.get("city") or "").lower():
            continue
        if company and company not in (row.get("company_name") or "").lower():
            continue
        if category:
            cats = " ".join(row.get("categories") or []).lower()
            if category not in cats and category not in (row.get("category") or "").lower():
                continue
        if bin_q and bin_q not in (row.get("bin") or "").lower():
            continue
        if phone and phone not in (row.get("phone") or "").lower():
            continue
        if email and email not in (row.get("email") or "").lower():
            continue
        if name and name not in (row.get("name") or "").lower():
            continue
        if contact and contact not in (row.get("contact_person") or "").lower():
            continue
        if bank and bank not in (row.get("bank_name") or "").lower():
            continue
        if website and website not in (row.get("website") or "").lower():
            continue
        if id_q and id_q not in (row.get("id") or "").lower():
            continue
        if has_bin == "1" and not row.get("bin"):
            continue
        if has_bin == "0" and row.get("bin"):
            continue
        if has_phone == "1" and not row.get("phone"):
            continue
        if has_phone == "0" and row.get("phone"):
            continue
        if not _admin_date_ok(row.get("created_at") or "", created_from, created_to):
            continue
        if q:
            hay = " ".join(
                [
                    row.get("name") or "",
                    row.get("email") or "",
                    row.get("company_name") or "",
                    row.get("bin") or "",
                    row.get("phone") or "",
                    row.get("city") or "",
                    row.get("contact_person") or "",
                    row.get("category") or "",
                    " ".join(row.get("categories") or []),
                    row.get("legal_address") or "",
                    row.get("actual_address") or "",
                    row.get("iban") or "",
                    row.get("bik") or "",
                    row.get("website") or "",
                    row.get("description") or "",
                    row.get("id") or "",
                ]
            ).lower()
            if q not in hay:
                continue
        items.append(row)
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    page, total, limit, offset = _admin_paginate(items)
    return jsonify(
        {"ok": True, "items": page, "total": total, "limit": limit, "offset": offset}
    )


@app.route("/api/admin/users/<user_id>/block", methods=["POST"])
@api_admin_required
def api_admin_user_block(user_id):
    data = request.get_json(silent=True) or {}
    blocked = bool(data.get("blocked"))
    target = find_user_by_id(user_id)
    if not target:
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 404
    if target.get("role") == "admin":
        return jsonify({"ok": False, "error": "Нельзя блокировать администратора"}), 400
    if target.get("id") == session.get("user_id"):
        return jsonify({"ok": False, "error": "Нельзя блокировать себя"}), 400
    target["blocked"] = blocked
    if blocked:
        target["blocked_at"] = now_iso()
        target["blocked_by"] = session.get("user_id")
    else:
        target.pop("blocked_at", None)
        target.pop("blocked_by", None)
    save_user(target)
    return jsonify(
        {
            "ok": True,
            "message": "Пользователь заблокирован" if blocked else "Пользователь разблокирован",
            "user": public_admin_user(target),
        }
    )


@app.route("/api/admin/requests")
@api_admin_required
def api_admin_requests():
    status = _admin_arg("status")
    q = _admin_arg_lower("q")
    user_email = _admin_arg_lower("user_email")
    user_name = _admin_arg_lower("user_name")
    user_id = _admin_arg_lower("user_id")
    category = _admin_arg_lower("category")
    request_id = _admin_arg_lower("id")
    has_offers = _admin_arg("has_offers")
    offers_min = _admin_int("offers_min")
    offers_max = _admin_int("offers_max")
    suppliers_min = _admin_int("suppliers_min")
    direct = _admin_arg("direct")
    created_from = _admin_arg("created_from")
    created_to = _admin_arg("created_to")

    items = []
    for r in load_requests():
        text = r.get("text") or ""
        offers_count = len(r.get("offers") or [])
        supplier_ids = r.get("supplier_ids") or []
        cats = r.get("matched_categories") or []
        row = {
            "id": r.get("id"),
            "text": text[:240],
            "summary": (r.get("summary") or "")[:160],
            "status": r.get("status") or "sent",
            "user_id": r.get("user_id") or "",
            "user_name": r.get("user_name") or "",
            "user_email": r.get("user_email") or "",
            "supplier_ids": supplier_ids,
            "suppliers_count": len(supplier_ids),
            "offers_count": offers_count,
            "created_at": r.get("created_at") or "",
            "expires_at": r.get("expires_at") or "",
            "matched_categories": cats,
            "direct_supplier_id": r.get("direct_supplier_id") or "",
            "product_id": r.get("product_id") or "",
        }
        if status and row["status"] != status:
            continue
        if user_email and user_email not in row["user_email"].lower():
            continue
        if user_name and user_name not in row["user_name"].lower():
            continue
        if user_id and user_id not in row["user_id"].lower():
            continue
        if request_id and request_id not in (row["id"] or "").lower():
            continue
        if category and category not in " ".join(cats).lower():
            continue
        if has_offers == "1" and offers_count <= 0:
            continue
        if has_offers == "0" and offers_count > 0:
            continue
        if offers_min is not None and offers_count < offers_min:
            continue
        if offers_max is not None and offers_count > offers_max:
            continue
        if suppliers_min is not None and len(supplier_ids) < suppliers_min:
            continue
        if direct == "1" and not row["direct_supplier_id"]:
            continue
        if direct == "0" and row["direct_supplier_id"]:
            continue
        if not _admin_date_ok(row["created_at"], created_from, created_to):
            continue
        if q:
            hay = " ".join(
                [
                    text,
                    row["summary"],
                    row["user_email"],
                    row["user_name"],
                    row["user_id"],
                    row["id"] or "",
                    " ".join(cats),
                    row["status"],
                ]
            ).lower()
            if q not in hay:
                continue
        items.append(row)
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    page, total, limit, offset = _admin_paginate(items)
    return jsonify(
        {"ok": True, "items": page, "total": total, "limit": limit, "offset": offset}
    )


@app.route("/api/admin/products")
@api_admin_required
def api_admin_products():
    q = _admin_arg_lower("q")
    category = _admin_arg_lower("category")
    subcategory = _admin_arg_lower("subcategory")
    company = _admin_arg_lower("company")
    supplier_id = _admin_arg_lower("supplier_id")
    unit = _admin_arg_lower("unit")
    name = _admin_arg_lower("name")
    has_image = _admin_arg("has_image")
    created_from = _admin_arg("created_from")
    created_to = _admin_arg("created_to")
    id_q = _admin_arg_lower("id")

    catalog = load_catalog() or {}
    users_by_id = {u.get("id"): u for u in load_users()}
    items = []
    for p in catalog.get("products") or []:
        sid = p.get("supplier_id") or ""
        supplier = users_by_id.get(sid) or {}
        company_name = (
            (supplier.get("supplier") or {}).get("company_name")
            or p.get("supplier_name")
            or supplier.get("name")
            or ""
        )
        image = p.get("image_url") or ""
        images = p.get("image_urls") or ([] if not image else [image])
        row = {
            "id": p.get("id"),
            "name": p.get("name") or "",
            "category": p.get("category") or "",
            "subcategory": p.get("subcategory") or p.get("subcategory_id") or "",
            "price": p.get("price") or "",
            "unit": p.get("unit") or "",
            "description": (p.get("description") or "")[:160],
            "supplier_id": sid,
            "company_name": company_name,
            "image_url": image,
            "images_count": len(images) if isinstance(images, list) else 0,
            "created_at": p.get("created_at") or "",
        }
        if category and category not in row["category"].lower():
            continue
        if subcategory and subcategory not in row["subcategory"].lower():
            continue
        if company and company not in row["company_name"].lower():
            continue
        if supplier_id and supplier_id not in sid.lower():
            continue
        if unit and unit not in row["unit"].lower():
            continue
        if name and name not in row["name"].lower():
            continue
        if id_q and id_q not in (row["id"] or "").lower():
            continue
        if has_image == "1" and row["images_count"] <= 0:
            continue
        if has_image == "0" and row["images_count"] > 0:
            continue
        if not _admin_date_ok(row["created_at"], created_from, created_to):
            continue
        if q:
            hay = " ".join(
                [
                    row["name"],
                    row["category"],
                    row["subcategory"],
                    row["company_name"],
                    row["unit"],
                    row["description"],
                    sid,
                    row["id"] or "",
                ]
            ).lower()
            if q not in hay:
                continue
        items.append(row)
    page, total, limit, offset = _admin_paginate(items)
    return jsonify(
        {"ok": True, "items": page, "total": total, "limit": limit, "offset": offset}
    )


@app.route("/api/admin/notifications")
@api_admin_required
def api_admin_notifications():
    q = _admin_arg_lower("q")
    ntype = _admin_arg_lower("type")
    user_id = _admin_arg_lower("user_id")
    read = _admin_arg("read")
    title = _admin_arg_lower("title")
    created_from = _admin_arg("created_from")
    created_to = _admin_arg("created_to")
    id_q = _admin_arg_lower("id")

    items = []
    for n in load_notifications():
        body = n.get("body") or n.get("message") or ""
        row = {
            "id": n.get("id"),
            "user_id": n.get("user_id") or "",
            "type": n.get("type") or "",
            "title": n.get("title") or "",
            "body": (body or "")[:200],
            "created_at": n.get("created_at") or "",
            "read": bool(n.get("read")),
            "request_id": n.get("request_id") or "",
        }
        if ntype and ntype not in row["type"].lower():
            continue
        if user_id and user_id not in row["user_id"].lower():
            continue
        if title and title not in row["title"].lower():
            continue
        if id_q and id_q not in (row["id"] or "").lower():
            continue
        if read == "1" and not row["read"]:
            continue
        if read == "0" and row["read"]:
            continue
        if not _admin_date_ok(row["created_at"], created_from, created_to):
            continue
        if q:
            hay = " ".join(
                [
                    row["title"],
                    row["body"],
                    row["type"],
                    row["user_id"],
                    row["request_id"],
                    row["id"] or "",
                ]
            ).lower()
            if q not in hay:
                continue
        items.append(row)
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    page, total, limit, offset = _admin_paginate(items)
    return jsonify(
        {"ok": True, "items": page, "total": total, "limit": limit, "offset": offset}
    )


@app.route("/api/admin/ratings")
@api_admin_required
def api_admin_ratings():
    q = _admin_arg_lower("q")
    score = _admin_arg("score")
    score_min = _admin_int("score_min")
    score_max = _admin_int("score_max")
    from_id = _admin_arg_lower("from_user_id")
    to_id = _admin_arg_lower("to_user_id")
    request_id = _admin_arg_lower("request_id")
    created_from = _admin_arg("created_from")
    created_to = _admin_arg("created_to")

    items = []
    for r in load_ratings():
        sc = r.get("score") if r.get("score") is not None else r.get("rating")
        try:
            sc_num = int(sc) if sc is not None and str(sc).strip() != "" else None
        except (TypeError, ValueError):
            sc_num = None
        row = {
            "id": r.get("id"),
            "request_id": r.get("request_id") or "",
            "from_user_id": r.get("from_user_id") or r.get("user_id") or "",
            "to_user_id": r.get("to_user_id") or r.get("supplier_id") or "",
            "score": sc if sc is not None else "",
            "comment": (r.get("comment") or "")[:200],
            "created_at": r.get("created_at") or "",
        }
        if score != "" and str(row["score"]) != score:
            continue
        if score_min is not None and (sc_num is None or sc_num < score_min):
            continue
        if score_max is not None and (sc_num is None or sc_num > score_max):
            continue
        if from_id and from_id not in row["from_user_id"].lower():
            continue
        if to_id and to_id not in row["to_user_id"].lower():
            continue
        if request_id and request_id not in row["request_id"].lower():
            continue
        if not _admin_date_ok(row["created_at"], created_from, created_to):
            continue
        if q:
            hay = " ".join(
                [
                    str(row["score"]),
                    row["comment"],
                    row["from_user_id"],
                    row["to_user_id"],
                    row["request_id"],
                    row["id"] or "",
                ]
            ).lower()
            if q not in hay:
                continue
        items.append(row)
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    page, total, limit, offset = _admin_paginate(items)
    return jsonify(
        {"ok": True, "items": page, "total": total, "limit": limit, "offset": offset}
    )


@app.route("/api/analytics/pulse", methods=["GET", "POST"])
def api_analytics_pulse():
    """Heartbeat / page presence for live admin wave."""
    data = request.get_json(silent=True) or {}
    # sendBeacon often POSTs with query string and empty body
    path = (data.get("path") or request.args.get("path") or "/")[:240]
    visitor_id = (data.get("vid") or request.args.get("vid") or "")[:80]
    kind = (data.get("kind") or request.args.get("kind") or "pulse")[:32]
    if kind not in ("pulse", "page_view"):
        kind = "pulse"
    track_event(kind, path=path, visitor_id=visitor_id)
    return jsonify({"ok": True})


@app.route("/api/admin/analytics")
@api_admin_required
def api_admin_analytics():
    """Rich live dashboard payload for admin_panel."""
    now = time.time()
    online_sec = 120
    hour_ago = now - 3600
    day_ago = now - 86400
    days14 = now - 14 * 86400

    users = load_users()
    requests_items = load_requests()
    buyers = [u for u in users if u.get("role") == "user"]
    suppliers = [u for u in users if u.get("role") == "supplier"]
    blocked = sum(1 for u in users if u.get("blocked"))

    by_status = {}
    offers_total = 0
    deals = 0
    for r in requests_items:
        st = r.get("status") or "sent"
        by_status[st] = by_status.get(st, 0) + 1
        offers_total += len(r.get("offers") or [])
        if st == "deal":
            deals += 1

    events_hour = db_store.fetch_analytics_events(hour_ago)
    events_day = db_store.fetch_analytics_events(day_ago)
    events_14 = db_store.fetch_analytics_events(days14)

    def count_kind(rows, kind):
        return sum(1 for e in rows if e.get("kind") == kind)

    online_now = db_store.distinct_visitors(now - online_sec)

    # Traffic wave: last 60 minutes, 1-min buckets
    wave_labels = []
    wave_views = []
    wave_online = []
    for i in range(59, -1, -1):
        start = now - (i + 1) * 60
        end = now - i * 60
        label_dt = datetime.fromtimestamp(end, tz=timezone.utc)
        wave_labels.append(label_dt.strftime("%H:%M"))
        bucket = [e for e in events_hour if start <= e["ts"] < end]
        wave_views.append(sum(1 for e in bucket if e["kind"] in ("page_view", "pulse")))
        vids = {e["visitor_id"] for e in bucket if e.get("visitor_id")}
        wave_online.append(len(vids))

    # Daily series last 14 days
    day_labels = []
    day_logins = []
    day_registers = []
    day_requests = []
    day_offers = []
    day_views = []
    for i in range(13, -1, -1):
        start = now - (i + 1) * 86400
        end = now - i * 86400
        day_labels.append(
            datetime.fromtimestamp(end, tz=timezone.utc).strftime("%d.%m")
        )
        bucket = [e for e in events_14 if start <= e["ts"] < end]
        day_logins.append(count_kind(bucket, "login"))
        day_registers.append(count_kind(bucket, "register"))
        day_requests.append(count_kind(bucket, "request_created"))
        day_offers.append(count_kind(bucket, "offer_sent"))
        day_views.append(sum(1 for e in bucket if e["kind"] in ("page_view", "pulse")))

    # Top pages (24h)
    page_counts: dict[str, int] = {}
    for e in events_day:
        if e["kind"] not in ("page_view", "pulse"):
            continue
        p = e.get("path") or "/"
        # normalize
        if "?" in p:
            p = p.split("?", 1)[0]
        page_counts[p] = page_counts.get(p, 0) + 1
    top_pages = sorted(page_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    # Role activity 24h
    role_activity = {"user": 0, "supplier": 0, "admin": 0, "guest": 0}
    for e in events_day:
        role = e.get("role") or "guest"
        if role not in role_activity:
            role = "guest"
        role_activity[role] += 1

    # Live feed (last 25 meaningful events)
    feed_kinds = {"login", "register", "request_created", "offer_sent", "page_view"}
    feed = []
    for e in reversed(events_hour):
        if e["kind"] not in feed_kinds:
            continue
        if e["kind"] == "page_view" and len(feed) > 8:
            continue
        feed.append(
            {
                "ts": e["ts"],
                "kind": e["kind"],
                "path": e.get("path") or "",
                "role": e.get("role") or "",
                "user_id": e.get("user_id") or "",
            }
        )
        if len(feed) >= 25:
            break

    created_today_users = 0
    for u in users:
        created = u.get("created_at") or ""
        if created and created[:10] == datetime.now(timezone.utc).strftime("%Y-%m-%d"):
            created_today_users += 1

    return jsonify(
        {
            "ok": True,
            "generated_at": now,
            "live": True,
            "ephemeral_note": bool(os.environ.get("VERCEL")) and not db_store.use_postgres(),
            "db": db_store.health(),
            "kpis": {
                "online_now": online_now,
                "views_1h": sum(
                    1 for e in events_hour if e["kind"] in ("page_view", "pulse")
                ),
                "views_24h": sum(
                    1 for e in events_day if e["kind"] in ("page_view", "pulse")
                ),
                "logins_24h": count_kind(events_day, "login"),
                "registers_24h": count_kind(events_day, "register"),
                "requests_24h": count_kind(events_day, "request_created"),
                "offers_24h": count_kind(events_day, "offer_sent"),
                "users_total": len(users),
                "buyers": len(buyers),
                "suppliers": len(suppliers),
                "blocked": blocked,
                "requests_total": len(requests_items),
                "offers_total": offers_total,
                "deals_active": deals,
                "users_created_today": created_today_users,
            },
            "requests_by_status": by_status,
            "role_activity_24h": role_activity,
            "wave": {"labels": wave_labels, "activity": wave_views, "unique": wave_online},
            "daily": {
                "labels": day_labels,
                "logins": day_logins,
                "registers": day_registers,
                "requests": day_requests,
                "offers": day_offers,
                "views": day_views,
            },
            "top_pages": [{"path": p, "count": c} for p, c in top_pages],
            "feed": feed,
        }
    )


# --- Старт приложения ---

if db_store.use_db():
    db_store.ensure_migrated()
ensure_admin_user()


if __name__ == "__main__":
    if db_store.use_db():
        db_store.ensure_migrated()
    else:
        # Создать пустые JSON-файлы, чтобы на пустой установке было куда писать
        save_users(load_users())
        save_requests(load_requests())
        if not NOTIFICATIONS_FILE.exists():
            save_notifications([])
        if not RATINGS_FILE.exists():
            save_ratings([])
    ensure_admin_user()

    host = os.environ.get("FLASK_HOST", "127.0.0.1" if IS_PRODUCTION else "0.0.0.0")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    debug = not IS_PRODUCTION and os.environ.get("FLASK_DEBUG", "1") != "0"

    if host == "0.0.0.0" and not IS_PRODUCTION:
        lan_ip = detect_lan_ip() or "127.0.0.1"
        print("\nHupHup is shared on your Wi‑Fi")
        print(f"  This PC:     http://127.0.0.1:{port}")
        print(f"  Other phones/PCs on same Wi‑Fi:  http://{lan_ip}:{port}")
        print("  Keep this window open while others use the site.\n")
    else:
        print(f"\nHupHup running at http://{host}:{port}\n")

    app.run(host=host, port=port, debug=debug, use_reloader=False)
