# HupHup (TenderBauka)

B2B procurement marketplace: buyers submit requests, suppliers reply with offers, parties close deals in chat.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Demo data (suppliers + catalog + SQLite) in one step:

```bash
python3 scripts/seed_all.py
```

Or manually: seed JSON files then migrate:

```bash
python3 scripts/seed_demo_suppliers.py
python3 scripts/seed_catalog.py
python3 scripts/migrate_json_to_sqlite.py
```

## Run (development)

```bash
# copy .env.example → .env and set SMTP_* for real email codes
export FLASK_SECRET_KEY=dev-secret
export APP_BASE_URL=http://127.0.0.1:5000
python3 app.py
# http://127.0.0.1:5000  (or FLASK_PORT)
```

On Windows (PowerShell), after creating `.env` from `.env.example`:

```powershell
pip install -r requirements.txt
python app.py
```

Registration sends a **6-digit code** to the email (Gmail App Password recommended). Without SMTP in dev, the code is printed in the server console.

Force JSON files instead of SQLite:

```bash
USE_SQLITE=0 python3 app.py
```

## Run (production)

```bash
export FLASK_ENV=production
export FLASK_SECRET_KEY='long-random-secret'
export APP_BASE_URL=https://your-domain.example
export FLASK_PORT=5000
# optional SMTP for email alerts
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=...
export SMTP_PASSWORD=...
export SMTP_FROM='HupHup <noreply@example.com>'

gunicorn -w 1 -b 0.0.0.0:5000 'app:app'
```

Use **1 worker** while rate limits are in-memory. Set `PRODUCTION=1` or `FLASK_ENV=production` — both require a real `FLASK_SECRET_KEY`.

## Tests

```bash
python3 scripts/match_smoke.py
python3 scripts/e2e_test.py
python3 scripts/email_smoke.py   # dry-run; set SMTP_* + EMAIL_SMOKE_TO for live send
```

CI runs the same smoke tests on push/PR to `main` (see `.github/workflows/test.yml`).

## Env reference

| Variable | Purpose |
|----------|---------|
| `FLASK_SECRET_KEY` | Session secret (required in production) |
| `FLASK_ENV` / `PRODUCTION` | Production mode |
| `APP_BASE_URL` | Base URL for links in email notifications |
| `FLASK_PORT` | Listen port (dev `app.py`) |
| `USE_SQLITE` | `1` (default) or `0` for JSON files |
| `HUPHUP_DB` / `DATABASE_URL` | SQLite path (`sqlite:///...` supported) |
| `SMTP_*` | Email: registration codes + offer/request alerts |
| `EMAIL_SMOKE_TO` | Recipient for `scripts/email_smoke.py` live test |
| `ADMIN_EMAIL` | Admin account email (default `admin@huphup.kz`) |
| `ADMIN_PASSWORD` | Admin password (default `admin1234`) |
| `ADMIN_NAME` | Admin display name |

## Admin

Open `/admin` after login as admin. On startup the app ensures an admin user exists
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Admins can list buyers/suppliers, block/unblock,
and browse requests. Blocked users cannot log in; suppliers are excluded from matching.
Supplier BIN must be 12 digits and unique.
