"""Документное хранилище HupHup: SQLite (локально) или Postgres/Neon (DATABASE_URL).

Коллекции (users, requests, notifications, ratings, products) — JSON в строках.
Analytics — таблица analytics_events.
Если USE_SQLITE=0/json — app.py читает data/*.json напрямую (без этого модуля).
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

# --- Настройки / подключение ---

ON_VERCEL = bool(os.environ.get("VERCEL"))
PACKAGE_DATA_DIR = Path(__file__).parent / "data"
RUNTIME_DATA_DIR = Path("/tmp/huphup/data") if ON_VERCEL else PACKAGE_DATA_DIR
DATA_DIR = PACKAGE_DATA_DIR
DEFAULT_DB = RUNTIME_DATA_DIR / "huphup.db"

_lock = threading.RLock()
_sqlite_conn: sqlite3.Connection | None = None
_pg = None  # psycopg module when available
_migrated_ok = False


def _database_url() -> str:
    return (os.environ.get("DATABASE_URL") or "").strip()


def use_postgres() -> bool:
    """True если DATABASE_URL указывает на Postgres/Neon."""
    raw = _database_url().lower()
    return raw.startswith("postgres://") or raw.startswith("postgresql://")


def use_sqlite() -> bool:
    """True для файлового SQLite (не JSON-режим и не Postgres)."""
    if use_postgres():
        return False
    flag = (os.environ.get("USE_SQLITE") or "1").strip().lower()
    return flag not in ("0", "false", "no", "json")


def use_db() -> bool:
    """Есть SQL-хранилище (sqlite или postgres)."""
    return use_postgres() or use_sqlite()


def db_backend() -> str:
    if use_postgres():
        return "postgres"
    if use_sqlite():
        return "sqlite"
    return "json"


def db_path() -> Path:
    """Путь к SQLite-файлу (только для sqlite backend)."""
    raw = _database_url()
    if raw.startswith("sqlite:///"):
        return Path(raw.replace("sqlite:///", "", 1))
    if raw and not use_postgres():
        return Path(raw)
    if os.environ.get("HUPHUP_DB"):
        return Path(os.environ["HUPHUP_DB"])
    return DEFAULT_DB


def _normalize_pg_url(url: str) -> str:
    """Neon иногда отдаёт postgres:// — psycopg предпочитает postgresql://."""
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _pg_connect():
    global _pg
    if _pg is None:
        import psycopg
        from psycopg.rows import dict_row

        _pg = psycopg
        _pg.dict_row = dict_row  # type: ignore[attr-defined]
    url = _normalize_pg_url(_database_url())
    # channel_binding can break some serverless clients; keep sslmode
    conn = _pg.connect(url, row_factory=_pg.dict_row, connect_timeout=15)
    return conn


def connect():
    """Ленивое соединение: sqlite Connection или новый postgres Connection."""
    global _sqlite_conn
    if use_postgres():
        conn = _pg_connect()
        _init_schema_pg(conn)
        return conn
    with _lock:
        if _sqlite_conn is None:
            path = db_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            _sqlite_conn = sqlite3.connect(str(path), check_same_thread=False)
            _sqlite_conn.row_factory = sqlite3.Row
            _sqlite_conn.execute("PRAGMA journal_mode=WAL")
            _sqlite_conn.execute("PRAGMA synchronous=NORMAL")
            _init_schema_sqlite(_sqlite_conn)
        return _sqlite_conn


# --- Схема ---


def _init_schema_sqlite(conn: sqlite3.Connection) -> None:
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


def _init_schema_pg(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
              id TEXT PRIMARY KEY,
              supplier_id TEXT,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS requests (
              id TEXT PRIMARY KEY,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notifications (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ratings (
              id TEXT PRIMARY KEY,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              payload JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS analytics_events (
              id TEXT PRIMARY KEY,
              ts DOUBLE PRECISION NOT NULL,
              kind TEXT NOT NULL,
              path TEXT,
              user_id TEXT,
              role TEXT,
              visitor_id TEXT,
              meta JSONB
            );
            CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts);
            CREATE INDEX IF NOT EXISTS idx_analytics_kind ON analytics_events(kind);
            CREATE INDEX IF NOT EXISTS idx_analytics_visitor_ts ON analytics_events(visitor_id, ts);
            """
        )
    conn.commit()


def _q(sql: str) -> str:
    """SQLite uses ?; Postgres uses %s."""
    if use_postgres():
        return sql.replace("?", "%s")
    return sql


@contextmanager
def transaction():
    """Commit при успехе, rollback при ошибке."""
    if use_postgres():
        conn = connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    conn = connect()
    with _lock:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def _loads(raw: Any):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    return json.loads(raw)


def _dumps(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def _payload_param(data) -> Any:
    """Postgres JSONB via Jsonb wrapper; SQLite — JSON-строка."""
    if use_postgres():
        from psycopg.types.json import Jsonb

        return Jsonb(data)
    return _dumps(data)


def _row_payload(row) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return _loads(row.get("payload"))
    return _loads(row["payload"])


# --- Загрузка / сохранение коллекций ---


def load_users() -> list:
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM users")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
        with _lock:
            rows = conn.execute("SELECT payload FROM users").fetchall()
        return [_loads(r["payload"]) for r in rows]
    finally:
        if use_postgres():
            conn.close()


def save_users(users: list) -> None:
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users")
                for u in users:
                    if not u.get("id"):
                        continue
                    cur.execute(
                        "INSERT INTO users (id, payload) VALUES (%s, %s)",
                        (str(u.get("id")), _payload_param(u)),
                    )
        else:
            conn.execute("DELETE FROM users")
            conn.executemany(
                "INSERT INTO users (id, payload) VALUES (?, ?)",
                [(str(u.get("id")), _dumps(u)) for u in users if u.get("id")],
            )


def load_requests() -> list:
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM requests")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
        with _lock:
            rows = conn.execute("SELECT payload FROM requests").fetchall()
        return [_loads(r["payload"]) for r in rows]
    finally:
        if use_postgres():
            conn.close()


def save_requests(items: list) -> None:
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM requests")
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        "INSERT INTO requests (id, payload) VALUES (%s, %s)",
                        (str(i.get("id")), _payload_param(i)),
                    )
        else:
            conn.execute("DELETE FROM requests")
            conn.executemany(
                "INSERT INTO requests (id, payload) VALUES (?, ?)",
                [(str(i.get("id")), _dumps(i)) for i in items if i.get("id")],
            )


def load_notifications() -> list:
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM notifications")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
        with _lock:
            rows = conn.execute("SELECT payload FROM notifications").fetchall()
        return [_loads(r["payload"]) for r in rows]
    finally:
        if use_postgres():
            conn.close()


def save_notifications(items: list) -> None:
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM notifications")
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        "INSERT INTO notifications (id, user_id, payload) VALUES (%s, %s, %s)",
                        (
                            str(i.get("id")),
                            str(i.get("user_id") or ""),
                            _payload_param(i),
                        ),
                    )
        else:
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
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM ratings")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
        with _lock:
            rows = conn.execute("SELECT payload FROM ratings").fetchall()
        return [_loads(r["payload"]) for r in rows]
    finally:
        if use_postgres():
            conn.close()


def save_ratings(items: list) -> None:
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM ratings")
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        "INSERT INTO ratings (id, payload) VALUES (%s, %s)",
                        (str(i.get("id")), _payload_param(i)),
                    )
        else:
            conn.execute("DELETE FROM ratings")
            conn.executemany(
                "INSERT INTO ratings (id, payload) VALUES (?, ?)",
                [(str(i.get("id")), _dumps(i)) for i in items if i.get("id")],
            )


def load_catalog() -> dict:
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM meta WHERE key = %s", ("catalog_categories",))
                cats = cur.fetchone()
                cur.execute("SELECT payload FROM meta WHERE key = %s", ("catalog_templates",))
                templates = cur.fetchone()
                cur.execute("SELECT payload FROM products")
                products = cur.fetchall()
            return {
                "categories": _loads(cats["payload"]) if cats else [],
                "templates": _loads(templates["payload"]) if templates else [],
                "products": [_loads(r["payload"]) for r in products],
            }
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
    finally:
        if use_postgres():
            conn.close()


def save_catalog(data: dict) -> None:
    categories = data.get("categories") or []
    templates = data.get("templates") or []
    products = data.get("products") or []
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO meta (key, payload) VALUES (%s, %s)
                    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    ("catalog_categories", _payload_param(categories)),
                )
                cur.execute(
                    """
                    INSERT INTO meta (key, payload) VALUES (%s, %s)
                    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    ("catalog_templates", _payload_param(templates)),
                )
                cur.execute("DELETE FROM products")
                for p in products:
                    if not p.get("id"):
                        continue
                    cur.execute(
                        "INSERT INTO products (id, supplier_id, payload) VALUES (%s, %s, %s)",
                        (
                            str(p.get("id")),
                            str(p.get("supplier_id") or ""),
                            _payload_param(p),
                        ),
                    )
        else:
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
    """Если users пуста — подтянуть catalog.json (и users.json если есть)."""
    global _migrated_ok
    if not use_db() or _migrated_ok:
        return
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS c FROM users")
                n = cur.fetchone()["c"]
        else:
            with _lock:
                n = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    finally:
        if use_postgres():
            conn.close()

    if n > 0:
        _migrated_ok = True
        return
    if (PACKAGE_DATA_DIR / "users.json").exists() or (
        PACKAGE_DATA_DIR / "catalog.json"
    ).exists():
        migrate_from_json(PACKAGE_DATA_DIR)
    else:
        _migrated_ok = True


# --- Analytics ---


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
    if not use_db():
        return
    event_id = str(uuid.uuid4())
    when = float(ts if ts is not None else time.time())
    try:
        with transaction() as conn:
            if use_postgres():
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO analytics_events
                          (id, ts, kind, path, user_id, role, visitor_id, meta)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            event_id,
                            when,
                            str(kind or "event")[:64],
                            str(path or "")[:240],
                            str(user_id or "")[:64],
                            str(role or "")[:32],
                            str(visitor_id or "")[:80],
                            _payload_param(meta or {}),
                        ),
                    )
                    cutoff = when - 90 * 86400  # keep ~90 days on Neon
                    cur.execute("DELETE FROM analytics_events WHERE ts < %s", (cutoff,))
            else:
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
                cutoff = when - 14 * 86400
                conn.execute("DELETE FROM analytics_events WHERE ts < ?", (cutoff,))
    except Exception:
        return


def fetch_analytics_events(since_ts: float, kinds: list[str] | None = None) -> list[dict]:
    if not use_db():
        return []
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                if kinds:
                    cur.execute(
                        """
                        SELECT id, ts, kind, path, user_id, role, visitor_id, meta
                        FROM analytics_events
                        WHERE ts >= %s AND kind = ANY(%s)
                        ORDER BY ts ASC
                        """,
                        (since_ts, list(kinds)),
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, ts, kind, path, user_id, role, visitor_id, meta
                        FROM analytics_events
                        WHERE ts >= %s
                        ORDER BY ts ASC
                        """,
                        (since_ts,),
                    )
                rows = cur.fetchall()
        else:
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
    finally:
        if use_postgres():
            conn.close()

    out = []
    for r in rows:
        get = r.get if isinstance(r, dict) else r.__getitem__
        try:
            meta = _loads(get("meta")) if get("meta") is not None else {}
        except Exception:
            meta = {}
        out.append(
            {
                "id": get("id"),
                "ts": float(get("ts")),
                "kind": get("kind"),
                "path": get("path") or "",
                "user_id": get("user_id") or "",
                "role": get("role") or "",
                "visitor_id": get("visitor_id") or "",
                "meta": meta if isinstance(meta, dict) else {},
            }
        )
    return out


def count_analytics(since_ts: float, kind: str | None = None) -> int:
    if not use_db():
        return 0
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                if kind:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM analytics_events WHERE ts >= %s AND kind = %s",
                        (since_ts, kind),
                    )
                else:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM analytics_events WHERE ts >= %s",
                        (since_ts,),
                    )
                row = cur.fetchone()
        else:
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
    finally:
        if use_postgres():
            conn.close()
    return int(row["c"] if row else 0)


def distinct_visitors(since_ts: float, online_window_sec: float = 120) -> int:
    if not use_db():
        return 0
    conn = connect()
    try:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT visitor_id) AS c
                    FROM analytics_events
                    WHERE ts >= %s
                      AND visitor_id != ''
                      AND kind IN ('pulse', 'page_view')
                    """,
                    (since_ts,),
                )
                row = cur.fetchone()
        else:
            with _lock:
                row = conn.execute(
                    """
                    SELECT COUNT(DISTINCT visitor_id) AS c
                    FROM analytics_events
                    WHERE ts >= ?
                      AND visitor_id != ''
                      AND kind IN ('pulse', 'page_view')
                    """,
                    (since_ts,),
                ).fetchone()
    finally:
        if use_postgres():
            conn.close()
    return int(row["c"] if row else 0)


def health() -> dict:
    """Для админки: какой backend и доступен ли."""
    info = {"backend": db_backend(), "ok": False, "detail": ""}
    try:
        if not use_db():
            info["detail"] = "json mode"
            info["ok"] = True
            return info
        conn = connect()
        try:
            if use_postgres():
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 AS x")
                    cur.fetchone()
                host = urlparse(_database_url()).hostname or ""
                info["detail"] = host
            else:
                conn.execute("SELECT 1")
                info["detail"] = str(db_path())
            info["ok"] = True
        finally:
            if use_postgres():
                conn.close()
    except Exception as exc:
        info["detail"] = str(exc)[:200]
    return info
