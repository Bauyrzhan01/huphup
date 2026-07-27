"""SQLite-хранилище документов HupHup.

Коллекции (users, requests, notifications, ratings, products) лежат как JSON
в строках SQLite. Переключатель USE_SQLITE (по умолчанию вкл.); если выкл. —
app.py читает data/*.json.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

# --- Настройки / подключение ---

ON_VERCEL = bool(os.environ.get("VERCEL"))
# Seed JSON (catalog.json и т.п.) — из репозитория; запись БД на Vercel — в /tmp.
PACKAGE_DATA_DIR = Path(__file__).parent / "data"
RUNTIME_DATA_DIR = Path("/tmp/huphup/data") if ON_VERCEL else PACKAGE_DATA_DIR
DATA_DIR = PACKAGE_DATA_DIR
DEFAULT_DB = RUNTIME_DATA_DIR / "huphup.db"

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_migrated_ok = False  # ensure_migrated выполняется не чаще одного раза за процесс


def db_path() -> Path:
    """Путь к файлу БД: DATABASE_URL, HUPHUP_DB или значение по умолчанию."""
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if raw.startswith("sqlite:///"):
        return Path(raw.replace("sqlite:///", "", 1))
    if raw:
        return Path(raw)
    if os.environ.get("HUPHUP_DB"):
        return Path(os.environ["HUPHUP_DB"])
    return DEFAULT_DB


def use_sqlite() -> bool:
    """True, если USE_SQLITE не 0 / false / no / json."""
    flag = (os.environ.get("USE_SQLITE") or "1").strip().lower()
    return flag not in ("0", "false", "no", "json")


def connect() -> sqlite3.Connection:
    """Ленивое одиночное соединение с WAL; схема создаётся при первом открытии."""
    global _conn
    with _lock:
        if _conn is None:
            path = db_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(str(path), check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA synchronous=NORMAL")
            _init_schema(_conn)
        return _conn


# --- Схема ---


def _init_schema(conn: sqlite3.Connection) -> None:
    """Создать таблицы коллекций, если их ещё нет (id + JSON payload)."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          supplier_id TEXT,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ratings (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analytics_events (
          id TEXT PRIMARY KEY,
          ts REAL NOT NULL,
          kind TEXT NOT NULL,
          path TEXT,
          user_id TEXT,
          role TEXT,
          visitor_id TEXT,
          meta TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts);
        CREATE INDEX IF NOT EXISTS idx_analytics_kind ON analytics_events(kind);
        CREATE INDEX IF NOT EXISTS idx_analytics_visitor_ts ON analytics_events(visitor_id, ts);
        """
    )
    conn.commit()


@contextmanager
def transaction():
    """Commit при успехе, rollback при ошибке; держит процессный lock."""
    conn = connect()
    with _lock:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def _loads(raw: str):
    return json.loads(raw)


def _dumps(data) -> str:
    return json.dumps(data, ensure_ascii=False)


# --- Загрузка / сохранение коллекций ---


def load_users() -> list:
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM users").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_users(users: list) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM users")
        conn.executemany(
            "INSERT INTO users (id, payload) VALUES (?, ?)",
            [(str(u.get("id")), _dumps(u)) for u in users if u.get("id")],
        )


def load_requests() -> list:
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM requests").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_requests(items: list) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM requests")
        conn.executemany(
            "INSERT INTO requests (id, payload) VALUES (?, ?)",
            [(str(i.get("id")), _dumps(i)) for i in items if i.get("id")],
        )


def load_notifications() -> list:
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM notifications").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_notifications(items: list) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM notifications")
        conn.executemany(
            "INSERT INTO notifications (id, user_id, payload) VALUES (?, ?, ?)",
            [
                (str(i.get("id")), str(i.get("user_id") or ""), _dumps(i))
                for i in items
                if i.get("id")
            ],
        )


def load_ratings() -> list:
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM ratings").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_ratings(items: list) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM ratings")
        conn.executemany(
            "INSERT INTO ratings (id, payload) VALUES (?, ?)",
            [(str(i.get("id")), _dumps(i)) for i in items if i.get("id")],
        )


def load_catalog() -> dict:
    """Категории/шаблоны из meta + все payload товаров."""
    conn = connect()
    with _lock:
        cats = conn.execute(
            "SELECT payload FROM meta WHERE key = ?", ("catalog_categories",)
        ).fetchone()
        templates = conn.execute(
            "SELECT payload FROM meta WHERE key = ?", ("catalog_templates",)
        ).fetchone()
        products = conn.execute("SELECT payload FROM products").fetchall()
    return {
        "categories": _loads(cats["payload"]) if cats else [],
        "templates": _loads(templates["payload"]) if templates else [],
        "products": [_loads(r["payload"]) for r in products],
    }


def save_catalog(data: dict) -> None:
    """Заменить категории/шаблоны каталога (meta) и строки товаров."""
    categories = data.get("categories") or []
    templates = data.get("templates") or []
    products = data.get("products") or []
    with transaction() as conn:
        conn.execute(
            "INSERT INTO meta (key, payload) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET payload = excluded.payload",
            ("catalog_categories", _dumps(categories)),
        )
        conn.execute(
            "INSERT INTO meta (key, payload) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET payload = excluded.payload",
            ("catalog_templates", _dumps(templates)),
        )
        conn.execute("DELETE FROM products")
        conn.executemany(
            "INSERT INTO products (id, supplier_id, payload) VALUES (?, ?, ?)",
            [
                (str(p.get("id")), str(p.get("supplier_id") or ""), _dumps(p))
                for p in products
                if p.get("id")
            ],
        )


# --- Миграция из JSON ---


def migrate_from_json(data_dir: Path | None = None) -> dict:
    """Импорт data/*.json в SQLite. Возвращает числа записей."""
    global _migrated_ok
    root = data_dir or DATA_DIR
    counts = {"users": 0, "requests": 0, "notifications": 0, "ratings": 0, "products": 0}

    def read(name, default):
        path = root / name
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return default

    users = read("users.json", [])
    requests = read("requests.json", [])
    notifications = read("notifications.json", [])
    ratings = read("ratings.json", [])
    catalog = read("catalog.json", {"categories": [], "products": []})

    save_users(users if isinstance(users, list) else [])
    save_requests(requests if isinstance(requests, list) else [])
    save_notifications(notifications if isinstance(notifications, list) else [])
    save_ratings(ratings if isinstance(ratings, list) else [])
    if isinstance(catalog, dict):
        save_catalog(catalog)
        counts["products"] = len(catalog.get("products") or [])
    counts["users"] = len(users) if isinstance(users, list) else 0
    counts["requests"] = len(requests) if isinstance(requests, list) else 0
    counts["notifications"] = len(notifications) if isinstance(notifications, list) else 0
    counts["ratings"] = len(ratings) if isinstance(ratings, list) else 0
    _migrated_ok = True
    return counts


def ensure_migrated() -> None:
    """Если таблица users пуста, а users.json есть — импорт один раз (с кэшем)."""
    global _migrated_ok
    if not use_sqlite() or _migrated_ok:
        return
    conn = connect()
    with _lock:
        n = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    if n > 0:
        _migrated_ok = True
        return
    # На Vercel users.json обычно нет — всё равно подтянуть catalog.json из пакета.
    if (PACKAGE_DATA_DIR / "users.json").exists() or (
        PACKAGE_DATA_DIR / "catalog.json"
    ).exists():
        migrate_from_json(PACKAGE_DATA_DIR)
    else:
        _migrated_ok = True


# --- Analytics (live dashboard) ---


def record_analytics_event(
    kind: str,
    *,
    path: str = "",
    user_id: str = "",
    role: str = "",
    visitor_id: str = "",
    meta: dict | None = None,
    ts: float | None = None,
) -> None:
    """Записать событие аналитики (best-effort)."""
    if not use_sqlite():
        return
    event_id = str(__import__("uuid").uuid4())
    when = float(ts if ts is not None else __import__("time").time())
    try:
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO analytics_events
                  (id, ts, kind, path, user_id, role, visitor_id, meta)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    when,
                    str(kind or "event")[:64],
                    str(path or "")[:240],
                    str(user_id or "")[:64],
                    str(role or "")[:32],
                    str(visitor_id or "")[:80],
                    _dumps(meta or {}),
                ),
            )
            # Keep last ~14 days to bound /tmp growth on Vercel
            cutoff = when - 14 * 86400
            conn.execute("DELETE FROM analytics_events WHERE ts < ?", (cutoff,))
    except Exception:
        # Analytics must never break the product path
        return


def fetch_analytics_events(since_ts: float, kinds: list[str] | None = None) -> list[dict]:
    if not use_sqlite():
        return []
    conn = connect()
    with _lock:
        if kinds:
            placeholders = ",".join("?" for _ in kinds)
            rows = conn.execute(
                f"""
                SELECT id, ts, kind, path, user_id, role, visitor_id, meta
                FROM analytics_events
                WHERE ts >= ? AND kind IN ({placeholders})
                ORDER BY ts ASC
                """,
                (since_ts, *kinds),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, ts, kind, path, user_id, role, visitor_id, meta
                FROM analytics_events
                WHERE ts >= ?
                ORDER BY ts ASC
                """,
                (since_ts,),
            ).fetchall()
    out = []
    for r in rows:
        try:
            meta = _loads(r["meta"]) if r["meta"] else {}
        except Exception:
            meta = {}
        out.append(
            {
                "id": r["id"],
                "ts": float(r["ts"]),
                "kind": r["kind"],
                "path": r["path"] or "",
                "user_id": r["user_id"] or "",
                "role": r["role"] or "",
                "visitor_id": r["visitor_id"] or "",
                "meta": meta if isinstance(meta, dict) else {},
            }
        )
    return out


def count_analytics(since_ts: float, kind: str | None = None) -> int:
    if not use_sqlite():
        return 0
    conn = connect()
    with _lock:
        if kind:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM analytics_events WHERE ts >= ? AND kind = ?",
                (since_ts, kind),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM analytics_events WHERE ts >= ?",
                (since_ts,),
            ).fetchone()
    return int(row["c"] if row else 0)


def distinct_visitors(since_ts: float, online_window_sec: float = 120) -> int:
    """Уникальные visitor_id с pulse/page_view за окно (онлайн сейчас)."""
    if not use_sqlite():
        return 0
    since = since_ts
    conn = connect()
    with _lock:
        row = conn.execute(
            """
            SELECT COUNT(DISTINCT visitor_id) AS c
            FROM analytics_events
            WHERE ts >= ?
              AND visitor_id != ''
              AND kind IN ('pulse', 'page_view')
            """,
            (since,),
        ).fetchone()
    return int(row["c"] if row else 0)
