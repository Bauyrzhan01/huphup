# HupHup Monitor

Бөлек Vercel сайт — backend API мен PostgreSQL статусын бақылайды.

**[DOCUMENTATION.md](./DOCUMENTATION.md)** — толық құжаттама.

Платформа бойынша толық гайд: `../huphup-backend/DOCUMENTATION.md`

## Не көрсетеді

- **Backend API** — `/api/v1/health` жауабы
- **PostgreSQL** — `database: up|down` + query latency
- **Uptime** — ағымдағы сессиядағы сәтті тексерулер %
- **Тарих** — соңғы 60 тексеру кестесі + sparkline

## Лokal іске қосу

```bash
cd huphup-monitor
npm install
cp .env.example .env
npm run dev
```

## Vercel-ге deploy

1. GitHub-қа жаңа repo: `huphup-monitor`
2. [vercel.com](https://vercel.com) → **Add New Project** → repo таңдау
3. **Environment Variables** қосу:

| Key | Value |
|-----|-------|
| `VITE_API_HEALTH_URL` | `https://huphup-api.onrender.com/api/v1/health` |
| `VITE_FRONTEND_URL` | `https://huphup-frontend.vercel.app` |
| `VITE_POLL_SECONDS` | `30` |

4. Deploy → URL мысалы: `https://huphup-monitor.vercel.app`

> Негізгі app-тен бөлек project болуы керек — тек мониторинг.

## Backend

Health endpoint қазір `dbLatencyMs` қайтарады (Render deploy керек).

```json
{
  "status": "ok",
  "service": "huphup-backend",
  "database": "up",
  "dbLatencyMs": 42,
  "time": "2026-08-14T12:00:00.000Z"
}
```
