# HupHup Monitor — құжаттама

> **Толық платформа құжаттамасы (барлық 3 проект):**  
> `../huphup-backend/DOCUMENTATION.md`

---

## Қысқаша

| | |
|---|---|
| **Мақсат** | Backend, DB, Frontend, Gemini бақылау dashboard |
| **Папка** | `C:\dev\huphup-monitor` |
| **GitHub** | https://github.com/Bauyrzhan01/huphup-monitor |
| **Production** | https://huphup-monitor.vercel.app |
| **Local порт** | `5173` (Vite default) |
| **Стек** | Vite + TypeScript (vanilla, React жоқ) |

---

## Іске қосу

```powershell
cd huphup-monitor
copy .env.example .env
npm install
npm run dev
```

---

## Файлдар

| Файл | Мақсаты |
|------|---------|
| `index.html` | Dashboard UI: sidebar, tabs, кестелер, графиктер |
| `src/main.ts` | Health polling, ops snapshot, tab switching, mobile nav |
| `src/charts.ts` | Latency / uptime / status графиктер (canvas) |
| `src/style.css` | Стильдер + mobile drawer меню |
| `api/snapshot.js` | Vercel serverless — ops API proxy |
| `vercel.json` | Vercel deploy конфиг |
| `.env.example` | Env мысалы |

---

## Tabs (бөлімдер)

| Tab | Не көрсетеді |
|-----|--------------|
| **Dashboard** | API, DB, Frontend статус, latency график, uptime |
| **Backend** | API traffic, соңғы hit-тер |
| **База** | Table counts, SQL queries, requests/offers feed |
| **Frontend** | Vercel беттерінің қолжетімділігі |
| **Gemini** | AI шақырулары, latency, қателер |
| **Тарих** | Соңғы 60 тексеру |
| **Endpoints** | Бақыланатын URL-дар |

---

## Environment

| Айнымалы | Сипаттама |
|----------|-----------|
| `VITE_API_HEALTH_URL` | `https://huphup-api.onrender.com/api/v1/health` |
| `VITE_API_OPS_URL` | Ops snapshot URL |
| `VITE_FRONTEND_URL` | Frontend URL |
| `VITE_POLL_SECONDS` | Авто-refresh (сек, default 10) |

`MONITOR_SECRET` — dashboard UI-да енгізіледі (Render backend env-те де бірдей болуы керек).

---

## Командалар

```bash
npm run dev       # local dev
npm run build     # production build → dist/
npm run preview   # preview build
```

---

## Deploy

```bash
npx vercel --prod
```

Vercel env: `VITE_API_HEALTH_URL`, `VITE_FRONTEND_URL`, `VITE_POLL_SECONDS`

---

## Mobile

- Гамбургер меню → drawer sidebar
- Кестелер horizontal scroll
- Stat карточкалар 2×2 grid
