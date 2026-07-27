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
_pool = None  # psycopg_pool.ConnectionPool
_migrated_ok = False
_schema_ready = False


def _close_pool() -> None:
    global _pool
    if _pool is None:
        return
    try:
        _pool.close()
    except Exception:
        pass
    _pool = None


import atexit

atexit.register(_close_pool)


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
    # Drop channel_binding for broader client compatibility
    if "channel_binding=" in url:
        parts = []
        for chunk in url.split("&"):
            if not chunk.startswith("channel_binding="):
                parts.append(chunk)
        url = "&".join(parts)
    return url


def _get_pool():
    """Shared Postgres pool (safe for serverless multi-request)."""
    global _pool, _pg, _schema_ready
    if _pool is not None:
        return _pool
    import psycopg
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    _pg = psycopg
    _pg.dict_row = dict_row  # type: ignore[attr-defined]
    max_size = max(2, min(20, int(os.environ.get("PG_POOL_MAX") or "10")))
    min_size = 0 if ON_VERCEL else 1
    _pool = ConnectionPool(
        conninfo=_normalize_pg_url(_database_url()),
        min_size=min_size,
        max_size=max_size,
        timeout=30,
        kwargs={"row_factory": dict_row, "connect_timeout": 15},
        open=True,
    )
    with _pool.connection() as conn:
        _init_schema_pg(conn)
        conn.commit()
    _schema_ready = True
    return _pool


@contextmanager
def pg_conn():
    with _get_pool().connection() as conn:
        yield conn


def connect():
    """SQLite: process-long connection. Postgres callers must use pg_conn()."""
    global _sqlite_conn
    if use_postgres():
        raise RuntimeError("Use pg_conn() for Postgres — connect() is SQLite-only")
    with _lock:
        if _sqlite_conn is None:
            path = db_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            _sqlite_conn = sqlite3.connect(str(path), check_same_thread=False)
            _sqlite_conn.row_factory = sqlite3.Row
            _sqlite_conn.execute("PRAGMA journal_mode=WAL")
            _sqlite_conn.execute("PRAGMA synchronous=NORMAL")
            _sqlite_conn.execute("PRAGMA busy_timeout=5000")
            _sqlite_conn.execute("PRAGMA temp_store=MEMORY")
            _init_schema_sqlite(_sqlite_conn)
        return _sqlite_conn


def _putconn(conn) -> None:
    """Legacy no-op; pool connections are returned via pg_conn() context."""
    return


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
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (json_extract(payload, '$.email'));
        CREATE INDEX IF NOT EXISTS idx_users_role ON users (json_extract(payload, '$.role'));
        CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (json_extract(payload, '$.status'));
        CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id);
        CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);
        CREATE TABLE IF NOT EXISTS pending_registrations (
          email TEXT PRIMARY KEY,
          code_digest TEXT NOT NULL,
          user_payload TEXT NOT NULL,
          expires_at REAL NOT NULL,
          sent_at REAL NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);
        CREATE TABLE IF NOT EXISTS pending_password_resets (
          email TEXT PRIMARY KEY,
          code_digest TEXT NOT NULL,
          expires_at REAL NOT NULL,
          sent_at REAL NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires ON pending_password_resets(expires_at);
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
            CREATE INDEX IF NOT EXISTS idx_users_email_lower
              ON users ((lower(payload->>'email')));
            CREATE INDEX IF NOT EXISTS idx_users_role
              ON users ((payload->>'role'));
            CREATE INDEX IF NOT EXISTS idx_users_blocked
              ON users ((payload->>'blocked'));
            CREATE INDEX IF NOT EXISTS idx_requests_status
              ON requests ((payload->>'status'));
            CREATE INDEX IF NOT EXISTS idx_requests_user
              ON requests ((payload->>'user_id'));
            CREATE INDEX IF NOT EXISTS idx_requests_created
              ON requests ((payload->>'created_at'));
            CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id);
            CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);
            CREATE INDEX IF NOT EXISTS idx_products_category
              ON products ((payload->>'category'));
            CREATE TABLE IF NOT EXISTS pending_registrations (
              email TEXT PRIMARY KEY,
              code_digest TEXT NOT NULL,
              user_payload JSONB NOT NULL,
              expires_at DOUBLE PRECISION NOT NULL,
              sent_at DOUBLE PRECISION NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);
            CREATE TABLE IF NOT EXISTS pending_password_resets (
              email TEXT PRIMARY KEY,
              code_digest TEXT NOT NULL,
              expires_at DOUBLE PRECISION NOT NULL,
              sent_at DOUBLE PRECISION NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires ON pending_password_resets(expires_at);
            """
        )
    conn.commit()


@contextmanager
def transaction():
    """Commit при успехе, rollback при ошибке."""
    if use_postgres():
        with pg_conn() as conn:
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
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
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM users")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM users").fetchall()
    return [_loads(r["payload"]) for r in rows]


def get_user_by_id(user_id: str):
    if not user_id:
        return None
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM users WHERE id = %s", (str(user_id),))
                row = cur.fetchone()
            return _loads(row["payload"]) if row else None
    conn = connect()
    with _lock:
        row = conn.execute(
            "SELECT payload FROM users WHERE id = ?", (str(user_id),)
        ).fetchone()
    return _loads(row["payload"]) if row else None


def get_user_by_email(email: str):
    email = (email or "").strip().lower()
    if not email:
        return None
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT payload FROM users WHERE lower(payload->>'email') = %s LIMIT 1",
                    (email,),
                )
                row = cur.fetchone()
            return _loads(row["payload"]) if row else None
    # SQLite / fallback scan
    for user in load_users():
        if (user.get("email") or "").lower() == email:
            return user
    return None


def upsert_user(user: dict) -> None:
    """Insert or update a single user (O(1) write)."""
    uid = str((user or {}).get("id") or "")
    if not uid:
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (id, payload) VALUES (%s, %s)
                    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    (uid, _payload_param(user)),
                )
        else:
            conn.execute(
                "INSERT INTO users (id, payload) VALUES (?, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                (uid, _dumps(user)),
            )


def save_users(users: list) -> None:
    """Full sync via upsert + delete orphans (avoids wipe-then-insert gap)."""
    ids = [str(u.get("id")) for u in users if u.get("id")]
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                for u in users:
                    if not u.get("id"):
                        continue
                    cur.execute(
                        """
                        INSERT INTO users (id, payload) VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                        """,
                        (str(u.get("id")), _payload_param(u)),
                    )
                if ids:
                    cur.execute("DELETE FROM users WHERE NOT (id = ANY(%s))", (ids,))
                else:
                    cur.execute("DELETE FROM users")
        else:
            for u in users:
                if not u.get("id"):
                    continue
                conn.execute(
                    "INSERT INTO users (id, payload) VALUES (?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                    (str(u.get("id")), _dumps(u)),
                )
            if ids:
                placeholders = ",".join("?" for _ in ids)
                conn.execute(
                    f"DELETE FROM users WHERE id NOT IN ({placeholders})",
                    ids,
                )
            else:
                conn.execute("DELETE FROM users")


def load_requests() -> list:
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM requests")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM requests").fetchall()
    return [_loads(r["payload"]) for r in rows]


def get_request_by_id(request_id: str):
    if not request_id:
        return None
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM requests WHERE id = %s", (str(request_id),))
                row = cur.fetchone()
            return _loads(row["payload"]) if row else None
    conn = connect()
    with _lock:
        row = conn.execute(
            "SELECT payload FROM requests WHERE id = ?", (str(request_id),)
        ).fetchone()
    return _loads(row["payload"]) if row else None


def upsert_request(item: dict) -> None:
    rid = str((item or {}).get("id") or "")
    if not rid:
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO requests (id, payload) VALUES (%s, %s)
                    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    (rid, _payload_param(item)),
                )
        else:
            conn.execute(
                "INSERT INTO requests (id, payload) VALUES (?, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                (rid, _dumps(item)),
            )


def save_requests(items: list) -> None:
    ids = [str(i.get("id")) for i in items if i.get("id")]
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        """
                        INSERT INTO requests (id, payload) VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                        """,
                        (str(i.get("id")), _payload_param(i)),
                    )
                if ids:
                    cur.execute("DELETE FROM requests WHERE NOT (id = ANY(%s))", (ids,))
                else:
                    cur.execute("DELETE FROM requests")
        else:
            for i in items:
                if not i.get("id"):
                    continue
                conn.execute(
                    "INSERT INTO requests (id, payload) VALUES (?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                    (str(i.get("id")), _dumps(i)),
                )
            if ids:
                placeholders = ",".join("?" for _ in ids)
                conn.execute(
                    f"DELETE FROM requests WHERE id NOT IN ({placeholders})",
                    ids,
                )
            else:
                conn.execute("DELETE FROM requests")


def load_notifications() -> list:
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM notifications")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM notifications").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_notifications(items: list) -> None:
    ids = [str(i.get("id")) for i in items if i.get("id")]
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        """
                        INSERT INTO notifications (id, user_id, payload)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                          SET user_id = EXCLUDED.user_id, payload = EXCLUDED.payload
                        """,
                        (
                            str(i.get("id")),
                            str(i.get("user_id") or ""),
                            _payload_param(i),
                        ),
                    )
                if ids:
                    cur.execute(
                        "DELETE FROM notifications WHERE NOT (id = ANY(%s))", (ids,)
                    )
                else:
                    cur.execute("DELETE FROM notifications")
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
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM ratings")
                rows = cur.fetchall()
            return [_loads(r["payload"]) for r in rows]
    conn = connect()
    with _lock:
        rows = conn.execute("SELECT payload FROM ratings").fetchall()
    return [_loads(r["payload"]) for r in rows]


def save_ratings(items: list) -> None:
    ids = [str(i.get("id")) for i in items if i.get("id")]
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                for i in items:
                    if not i.get("id"):
                        continue
                    cur.execute(
                        """
                        INSERT INTO ratings (id, payload) VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                        """,
                        (str(i.get("id")), _payload_param(i)),
                    )
                if ids:
                    cur.execute("DELETE FROM ratings WHERE NOT (id = ANY(%s))", (ids,))
                else:
                    cur.execute("DELETE FROM ratings")
        else:
            conn.execute("DELETE FROM ratings")
            conn.executemany(
                "INSERT INTO ratings (id, payload) VALUES (?, ?)",
                [(str(i.get("id")), _dumps(i)) for i in items if i.get("id")],
            )


def load_catalog() -> dict:
    if use_postgres():
        with pg_conn() as conn:
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
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS c FROM users")
                n = cur.fetchone()["c"]
    else:
        conn = connect()
        with _lock:
            n = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]

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
    if use_postgres():
        with pg_conn() as conn:
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
    if use_postgres():
        with pg_conn() as conn:
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
    if not use_db():
        return 0
    if use_postgres():
        with pg_conn() as conn:
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
                (since_ts,),
            ).fetchone()
    return int(row["c"] if row else 0)


def count_users() -> int:
    if not use_db():
        return 0
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS c FROM users")
                return int(cur.fetchone()["c"])
    conn = connect()
    with _lock:
        return int(conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"])


def user_role_counts() -> dict:
    """Cheap role/blocked aggregates for admin overview."""
    out = {"buyers": 0, "suppliers": 0, "admins": 0, "blocked": 0, "total": 0}
    if not use_db():
        return out
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE payload->>'role' = 'user') AS buyers,
                      COUNT(*) FILTER (WHERE payload->>'role' = 'supplier') AS suppliers,
                      COUNT(*) FILTER (WHERE payload->>'role' = 'admin') AS admins,
                      COUNT(*) FILTER (
                        WHERE coalesce(payload->>'blocked', 'false') IN ('true', '1', 'True')
                      ) AS blocked
                    FROM users
                    """
                )
                row = cur.fetchone() or {}
                out.update(
                    {
                        "total": int(row.get("total") or 0),
                        "buyers": int(row.get("buyers") or 0),
                        "suppliers": int(row.get("suppliers") or 0),
                        "admins": int(row.get("admins") or 0),
                        "blocked": int(row.get("blocked") or 0),
                    }
                )
                return out
    users = load_users()
    out["total"] = len(users)
    for u in users:
        role = u.get("role")
        if role == "user":
            out["buyers"] += 1
        elif role == "supplier":
            out["suppliers"] += 1
        elif role == "admin":
            out["admins"] += 1
        if u.get("blocked"):
            out["blocked"] += 1
    return out


def request_status_counts() -> dict:
    out = {}
    if not use_db():
        return out
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT coalesce(payload->>'status', 'sent') AS status, COUNT(*) AS c
                    FROM requests
                    GROUP BY 1
                    """
                )
                for row in cur.fetchall():
                    out[str(row["status"])] = int(row["c"])
                return out
    for r in load_requests():
        st = r.get("status") or "sent"
        out[st] = out.get(st, 0) + 1
    return out


def count_requests() -> int:
    if not use_db():
        return 0
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS c FROM requests")
                return int(cur.fetchone()["c"])
    conn = connect()
    with _lock:
        return int(conn.execute("SELECT COUNT(*) AS c FROM requests").fetchone()["c"])


def list_users_page(offset: int = 0, limit: int = 50) -> list:
    """Paginated user payloads for admin lists."""
    offset = max(0, int(offset or 0))
    limit = max(1, min(200, int(limit or 50)))
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT payload FROM users ORDER BY id LIMIT %s OFFSET %s",
                    (limit, offset),
                )
                return [_loads(r["payload"]) for r in cur.fetchall()]
    conn = connect()
    with _lock:
        rows = conn.execute(
            "SELECT payload FROM users ORDER BY id LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_loads(r["payload"]) for r in rows]


def list_requests_page(offset: int = 0, limit: int = 50) -> list:
    offset = max(0, int(offset or 0))
    limit = max(1, min(200, int(limit or 50)))
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT payload FROM requests ORDER BY id LIMIT %s OFFSET %s",
                    (limit, offset),
                )
                return [_loads(r["payload"]) for r in cur.fetchall()]
    conn = connect()
    with _lock:
        rows = conn.execute(
            "SELECT payload FROM requests ORDER BY id LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_loads(r["payload"]) for r in rows]


def users_by_ids(ids: list[str]) -> dict:
    """Map id -> user for a batch (avoids full table load)."""
    clean = [str(i) for i in ids if i]
    if not clean:
        return {}
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, payload FROM users WHERE id = ANY(%s)", (clean,)
                )
                return {r["id"]: _loads(r["payload"]) for r in cur.fetchall()}
    conn = connect()
    out = {}
    with _lock:
        placeholders = ",".join("?" for _ in clean)
        rows = conn.execute(
            f"SELECT id, payload FROM users WHERE id IN ({placeholders})",
            clean,
        ).fetchall()
        for r in rows:
            out[r["id"]] = _loads(r["payload"])
    return out


# --- Pending email verification (registration) ---


def purge_expired_pending_registrations(now_ts: float | None = None) -> None:
    """Remove expired pending rows (safe on every register/verify)."""
    if not use_db():
        return
    when = float(now_ts if now_ts is not None else time.time())
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM pending_registrations WHERE expires_at < %s", (when,)
                )
        else:
            conn.execute(
                "DELETE FROM pending_registrations WHERE expires_at < ?", (when,)
            )


def get_pending_registration(email: str) -> dict | None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return None
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT email, code_digest, user_payload, expires_at, sent_at, attempts
                    FROM pending_registrations WHERE email = %s
                    """,
                    (email,),
                )
                row = cur.fetchone()
    else:
        conn = connect()
        with _lock:
            row = conn.execute(
                """
                SELECT email, code_digest, user_payload, expires_at, sent_at, attempts
                FROM pending_registrations WHERE email = ?
                """,
                (email,),
            ).fetchone()
    if not row:
        return None
    get = row.get if isinstance(row, dict) else row.__getitem__
    return {
        "email": get("email"),
        "code_digest": get("code_digest"),
        "user": _loads(get("user_payload")),
        "expires_at": float(get("expires_at")),
        "sent_at": float(get("sent_at")),
        "attempts": int(get("attempts") or 0),
    }


def save_pending_registration(
    email: str,
    *,
    code_digest: str,
    user: dict,
    expires_at: float,
    sent_at: float,
    attempts: int = 0,
) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pending_registrations
                      (email, code_digest, user_payload, expires_at, sent_at, attempts)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET
                      code_digest = EXCLUDED.code_digest,
                      user_payload = EXCLUDED.user_payload,
                      expires_at = EXCLUDED.expires_at,
                      sent_at = EXCLUDED.sent_at,
                      attempts = EXCLUDED.attempts
                    """,
                    (
                        email,
                        code_digest,
                        _payload_param(user),
                        float(expires_at),
                        float(sent_at),
                        int(attempts),
                    ),
                )
        else:
            conn.execute(
                """
                INSERT INTO pending_registrations
                  (email, code_digest, user_payload, expires_at, sent_at, attempts)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                  code_digest = excluded.code_digest,
                  user_payload = excluded.user_payload,
                  expires_at = excluded.expires_at,
                  sent_at = excluded.sent_at,
                  attempts = excluded.attempts
                """,
                (
                    email,
                    code_digest,
                    _dumps(user),
                    float(expires_at),
                    float(sent_at),
                    int(attempts),
                ),
            )


def update_pending_registration(email: str, **fields) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db() or not fields:
        return
    allowed = {"code_digest", "expires_at", "sent_at", "attempts", "user"}
    sets = []
    vals = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        col = "user_payload" if key == "user" else key
        sets.append(f"{col} = %s" if use_postgres() else f"{col} = ?")
        vals.append(_payload_param(val) if key == "user" else val)
    if not sets:
        return
    vals.append(email)
    sql = (
        f"UPDATE pending_registrations SET {', '.join(sets)} WHERE email = %s"
        if use_postgres()
        else f"UPDATE pending_registrations SET {', '.join(sets)} WHERE email = ?"
    )
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(sql, vals)
        else:
            conn.execute(sql, vals)


def delete_pending_registration(email: str) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM pending_registrations WHERE email = %s", (email,)
                )
        else:
            conn.execute(
                "DELETE FROM pending_registrations WHERE email = ?", (email,)
            )


# --- Pending password reset (email code) ---


def purge_expired_pending_password_resets(now_ts: float | None = None) -> None:
    if not use_db():
        return
    when = float(now_ts if now_ts is not None else time.time())
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM pending_password_resets WHERE expires_at < %s", (when,)
                )
        else:
            conn.execute(
                "DELETE FROM pending_password_resets WHERE expires_at < ?", (when,)
            )


def get_pending_password_reset(email: str) -> dict | None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return None
    if use_postgres():
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT email, code_digest, expires_at, sent_at, attempts
                    FROM pending_password_resets WHERE email = %s
                    """,
                    (email,),
                )
                row = cur.fetchone()
    else:
        conn = connect()
        with _lock:
            row = conn.execute(
                """
                SELECT email, code_digest, expires_at, sent_at, attempts
                FROM pending_password_resets WHERE email = ?
                """,
                (email,),
            ).fetchone()
    if not row:
        return None
    get = row.get if isinstance(row, dict) else row.__getitem__
    return {
        "email": get("email"),
        "code_digest": get("code_digest"),
        "expires_at": float(get("expires_at")),
        "sent_at": float(get("sent_at")),
        "attempts": int(get("attempts") or 0),
    }


def save_pending_password_reset(
    email: str,
    *,
    code_digest: str,
    expires_at: float,
    sent_at: float,
    attempts: int = 0,
) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pending_password_resets
                      (email, code_digest, expires_at, sent_at, attempts)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET
                      code_digest = EXCLUDED.code_digest,
                      expires_at = EXCLUDED.expires_at,
                      sent_at = EXCLUDED.sent_at,
                      attempts = EXCLUDED.attempts
                    """,
                    (email, code_digest, expires_at, sent_at, attempts),
                )
        else:
            conn.execute(
                """
                INSERT INTO pending_password_resets
                  (email, code_digest, expires_at, sent_at, attempts)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                  code_digest = excluded.code_digest,
                  expires_at = excluded.expires_at,
                  sent_at = excluded.sent_at,
                  attempts = excluded.attempts
                """,
                (email, code_digest, expires_at, sent_at, attempts),
            )


def update_pending_password_reset(email: str, **fields) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db() or not fields:
        return
    allowed = {"code_digest", "expires_at", "sent_at", "attempts"}
    sets = []
    vals = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        sets.append(f"{key} = %s" if use_postgres() else f"{key} = ?")
        vals.append(val)
    if not sets:
        return
    vals.append(email)
    sql = (
        f"UPDATE pending_password_resets SET {', '.join(sets)} WHERE email = %s"
        if use_postgres()
        else f"UPDATE pending_password_resets SET {', '.join(sets)} WHERE email = ?"
    )
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(sql, vals)
        else:
            conn.execute(sql, vals)


def delete_pending_password_reset(email: str) -> None:
    email = (email or "").strip().lower()
    if not email or not use_db():
        return
    with transaction() as conn:
        if use_postgres():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM pending_password_resets WHERE email = %s", (email,)
                )
        else:
            conn.execute(
                "DELETE FROM pending_password_resets WHERE email = ?", (email,)
            )


def health() -> dict:
    """Для админки: какой backend и доступен ли."""
    info = {"backend": db_backend(), "ok": False, "detail": ""}
    try:
        if not use_db():
            info["detail"] = "json mode"
            info["ok"] = True
            return info
        if use_postgres():
            with pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 AS x")
                    cur.fetchone()
            host = urlparse(_database_url()).hostname or ""
            info["detail"] = host
        else:
            conn = connect()
            conn.execute("SELECT 1")
            info["detail"] = str(db_path())
        info["ok"] = True
    except Exception as exc:
        info["detail"] = str(exc)[:200]
    return info
