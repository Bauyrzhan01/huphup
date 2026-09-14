# HupHup — толық платформа құжаттамасы

B2B маркетплейс: **сатып алушы заявка жасайды → AI поставщілерді таңдайды → КП → чат**.

> **⚠️ Монорепоға дейінгі құжат.** Бұл файл 4 проект бөлек репо болған кездегі
> нұсқа. Қазір бәрі бір монорепода: `apps/backend`, `apps/frontend`, `apps/admin`,
> `apps/monitor`. Орнату/іске қосу бойынша ағымдағы нұсқау — түбірдегі
> [`README.md`](../../README.md) мен [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
> Төмендегі модуль/маршрут/бизнес-flow кестелері әлі дұрыс; тек папка жолдары мен
> «бөлек репо» деген жерлер ескірген.

---

## 1. Жалпы схема

```
┌─────────────────┐     HTTP/WS      ┌─────────────────┐     Prisma     ┌──────────────┐
│ huphup-frontend │  ──────────────► │ huphup-backend  │ ────────────► │ PostgreSQL   │
│ React + Vite    │                  │ NestJS + API    │               │ (Neon/local) │
└─────────────────┘                  └────────┬────────┘               └──────────────┘
                                              │
┌─────────────────┐     health/ops            │
│ huphup-monitor  │ ◄───────────────────────┘
│ Vite dashboard  │
└─────────────────┘
```

---

## 2. Проекттер және папкалар

| Проект | Локальді папка | GitHub | Production URL |
|--------|----------------|--------|----------------|
| **Backend (API)** | `huphup-backend` | [huphup-backend](https://github.com/Bauyrzhan01/huphup-backend) | https://huphup-api.onrender.com |
| **Frontend (сайт)** | `huphup-frontend` | [huphup-frontend](https://github.com/Bauyrzhan01/huphup-frontend) | https://huphup-frontend.vercel.app |
| **Monitor (бақылау)** | `huphup-monitor` | [huphup-monitor](https://github.com/Bauyrzhan01/huphup-monitor) | https://huphup-monitor.vercel.app |

---

## 3. Порттар (local)

| Сервис | Порт | URL | Не істейді |
|--------|------|-----|------------|
| **Frontend (Vite)** | `5173` | http://127.0.0.1:5173 | Сайт, UI |
| **Backend (NestJS)** | `3000` | http://127.0.0.1:3000/api/v1 | REST API |
| **Swagger** | `3000` | http://127.0.0.1:3000/docs | API документация |
| **Health** | `3000` | http://127.0.0.1:3000/api/v1/health | API + DB статус |
| **WebSocket чат** | `3000` | `ws://127.0.0.1:3000/chat` | Real-time чат |
| **PostgreSQL (Docker)** | `5432` | `127.0.0.1:5432` | База деректер |
| **Monitor (Vite)** | `5173`* | http://127.0.0.1:5173 | *басқа терминалда іске қоссаңыз, порт қайшы келмеуі үшін бір уақытта тек біреуін ашыңыз* |
| **Prisma Studio** | `5555` | http://localhost:5555 | DB GUI (`npm run prisma:studio`) |

---

## 4. Қажетті құралдар

- **Node.js** ≥ 20
- **npm**
- **Docker Desktop** (локальді Postgres үшін, опционал — Neon cloud та болады)
- **Git**

---

## 5. Толық local іске қосу

### Терминал 1 — Backend + DB

```powershell
cd C:\dev\huphup-backend

copy .env.example .env
# .env ішінде: DATABASE_URL, JWT_SECRET, GEMINI_API_KEY

npm install
npm run db:up              # Postgres Docker-да (порт 5432)
npm run prisma:generate
npm run prisma:migrate     # кестелерді құру
npm run prisma:seed        # тест деректер (опционал)
npm run start:dev          # API іске қосылады
```

Тексеру: http://127.0.0.1:3000/api/v1/health

### Терминал 2 — Frontend

```powershell
cd C:\dev\huphup-frontend

copy .env.example .env
# VITE_API_URL=http://127.0.0.1:3000/api/v1

npm install
npm run dev
```

Тексеру: http://127.0.0.1:5173

### Терминал 3 — Monitor (қажет болса)

```powershell
cd C:\dev\huphup-monitor

copy .env.example .env
npm install
npm run dev
```

---

## 6. Backend (`huphup-backend`) — файлдар мен модульдер

### Негізгі файлдар

| Файл / папка | Мақсаты |
|--------------|---------|
| `src/main.ts` | Серверді іске қосу, CORS, Swagger, WebSocket |
| `src/app.module.ts` | Барлық модульдерді біріктіру |
| `prisma/schema.prisma` | База модельдері (User, Request, Lead, …) |
| `prisma/migrations/` | DB миграциялары |
| `prisma/seed.ts` | Тест деректер (buyer + 10 supplier) |
| `.env` / `.env.example` | Конфигурация |
| `docker-compose.yml` | Локальді Postgres |
| `DOCS.md` | API endpoint толық құжаттамасы |
| `DEPLOY.md` | Render + Neon + Vercel deploy |
| `README.md` | Қысқа кіріспе |

### `src/` модульдері

| Модуль | Папка | Не істейді |
|--------|-------|------------|
| **auth** | `src/auth/` | Register, login, JWT, password reset |
| **users** | `src/users/` | Профиль, avatar, heartbeat (online) |
| **companies** | `src/companies/` | Supplier компания, мүшелер, invite |
| **products** | `src/products/` | Тауар каталогы, суреттер, reviews |
| **requests** | `src/requests/` | Заявка: analyze (AI), draft, publish |
| **matching** | `src/matching/` | Gemini мэтчинг → Lead құру, CRM leads |
| **crm** | `src/crm/` | CRM stages, automation, analytics |
| **gemini** | `src/gemini/` | Google Gemini API клиент |
| **offers** | `src/offers/` | Коммерциялық ұсыныстар (КП) |
| **conversations** | `src/conversations/` | Чат, SSE, WebSocket gateway |
| **notifications** | `src/notifications/` | In-app хабарламалар |
| **attachments** | `src/attachments/` | Заявкаға файл тіркеу |
| **storage** | `src/storage/` | Файл сақтау (local / S3) |
| **platform** | `src/platform/` | Public `GET /platform/live` (лендинг карта) |
| **ops** | `src/ops/` | Monitor snapshot API (`MONITOR_SECRET`) |
| **health** | `src/health/` | Health check + DB latency |
| **prisma** | `src/prisma/` | PrismaService (DB connection) |

### Backend командалары

```bash
npm run start:dev       # dev сервер (hot reload)
npm run build           # production build
npm run start:prod      # production іске қосу
npm run db:up           # Docker Postgres
npm run db:down         # Docker тоқтату
npm run prisma:migrate  # жаңа миграция
npm run prisma:deploy   # prod миграция
npm run prisma:seed     # тест деректер
npm run prisma:studio   # DB браузер
```

### Backend environment

| Айнымалы | Міндетті | Сипаттама |
|----------|----------|-----------|
| `PORT` | жоқ | Default `3000` |
| `API_PREFIX` | жоқ | Default `api/v1` |
| `DATABASE_URL` | **иә** | PostgreSQL connection string |
| `JWT_SECRET` | **иә** | Ұзын random string |
| `JWT_EXPIRES_IN` | жоқ | Default `7d` |
| `CORS_ORIGINS` | **иә** | Frontend URL (үтірмен) |
| `GEMINI_API_KEY` | prod | Google AI Studio key |
| `GEMINI_MODEL` | жоқ | Default `gemini-flash-latest` |
| `MONITOR_SECRET` | monitor үшін | Ops snapshot API кілті |
| `AWS_*` | опционал | S3 файл сақтау |

---

## 7. Frontend (`huphup-frontend`) — файлдар мен беттер

### Негізгі файлдар

| Файл / папка | Мақсаты |
|--------------|---------|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Барлық route-тар |
| `src/api/` | Backend API клиент (`api/index.ts`, `client.ts`) |
| `src/auth/` | AuthContext, login state, token |
| `src/types/` | TypeScript типтер |
| `src/i18n/` | Қазақ / орыс тілдері (`kk.json`, `ru.json`) |
| `src/styles.css` | Глобальді стильдер |
| `.env` | `VITE_API_URL` |
| `vite.config.ts` | Vite конфиг |

### `src/pages/` — беттер

| Файл | Route | Кімге | Не істейді |
|------|-------|-------|------------|
| `LandingPage.tsx` | `/` | Барлығы | Guest → marketing; Login → live карта |
| `auth/LoginPage.tsx` | `/login` | Guest | Кіру |
| `auth/RegisterPage.tsx` | `/register` | Guest | Тіркелу (BUYER / SUPPLIER) |
| `auth/ForgotPasswordPage.tsx` | `/forgot-password` | Guest | Пароль ұмытты |
| `auth/ResetPasswordPage.tsx` | `/reset-password` | Guest | Жаңа пароль |
| `buyer/HomePage.tsx` | `/app` | Buyer | Басты бет, заявка жасау |
| `buyer/RequestsPage.tsx` | `/requests` | Buyer | Менің заявкаларым |
| `buyer/NewRequestPage.tsx` | `/requests/new` | Buyer | Жаңа заявка |
| `buyer/EditRequestPage.tsx` | `/requests/:id/edit` | Buyer | Заявка өңдеу |
| `buyer/RequestDetailPage.tsx` | `/requests/:id` | Buyer | Заявка деталі, leads, offers |
| `buyer/OffersPage.tsx` | `/offers` | Buyer | Келген КП-лер |
| `buyer/SuppliersPage.tsx` | `/suppliers` | Buyer | Поставщиктер тізімі |
| `buyer/SupplierDetailPage.tsx` | `/suppliers/:id` | Buyer | Компания профилі |
| `buyer/ProductPage.tsx` | `/products/:id` | Buyer | Тауар беті |
| `buyer/ProfilePage.tsx` | `/profile` | Login | Профиль |
| `ConversationsPage.tsx` | `/conversations` | Login | Чат (WebSocket + SSE) |
| `supplier/SupplierDashboardPage.tsx` | `/supplier` | Supplier | Dashboard |
| `supplier/SupplierLeadsPage.tsx` | `/supplier/leads` | Supplier | Lead деталі, CRM |
| `supplier/SupplierCrmPage.tsx` | `/supplier/deals` | Supplier | CRM kanban |
| `supplier/SupplierTasksPage.tsx` | `/supplier/tasks` | Supplier | Тапсырмалар |
| `supplier/SupplierOffersPage.tsx` | `/supplier/offers` | Supplier | Жіберілген КП |
| `supplier/SupplierProductsPage.tsx` | `/supplier/products` | Supplier | Каталог |
| `supplier/SupplierProductDetailPage.tsx` | `/supplier/products/:id` | Supplier | Тауар өңдеу |
| `supplier/SupplierCompanyPage.tsx` | `/supplier/company` | Supplier | Компания профилі |
| `supplier/SupplierTeamPage.tsx` | `/supplier/team` | Supplier | Команда, invite |
| `supplier/SupplierCrmSettingsPage.tsx` | `/supplier/crm/settings` | Supplier | CRM баптаулар |
| `InviteAcceptPage.tsx` | `/invite/:token` | Guest | Компанияға шақыру |

### `src/landing/` — лендинг

| Папка | Мақсаты |
|-------|---------|
| `landing/hero/` | Marketing лендинг (guest): Hero, телефон анимация |
| `landing/sections/` | Connect, Path, Final секциялар, Footer |
| `landing/live/` | Live карта (login): Қазақстан картасы, ағын, статистика |

| Файл | Мақсаты |
|------|---------|
| `LiveLandingPage.tsx` | Live платформа беті (карта + feed) |
| `KazakhstanMap.tsx` | SVG карта, қалалар, hub |
| `MapFlowAnimation.tsx` | Сызық анимация (қала → HupHup → supplier) |
| `cities.ts` | Қала координаттары |
| `live-platform.css` | Live лендинг стильдері |

### `src/components/` — UI компоненттер

| Компонент | Мақсаты |
|-----------|---------|
| `ProtectedRoute.tsx` | Login тексеру |
| `NotificationsBell.tsx` | Хабарлама колокольчик |
| `MatchedSupplierCard.tsx` | Мэтчинг нәтижесі карточкасы |
| `UserAvatar.tsx` | Аватар |
| `LanguageSwitcher.tsx` | KK / RU тіл ауыстыру |
| `crm/*` | CRM: kanban, tasks, notes, timeline |
| `layouts/AppLayouts.tsx` | Buyer / Supplier sidebar layout |

### Frontend командалары

```bash
npm run dev       # dev сервер → :5173
npm run build     # production build → dist/
npm run preview   # build-ті локальді көру
npm run lint      # oxlint
```

### Frontend environment

| Айнымалы | Міндетті | Сипаттама |
|----------|----------|-----------|
| `VITE_API_URL` | **иә** | Backend API base URL |

Мысал:
```env
VITE_API_URL=http://127.0.0.1:3000/api/v1
```

---

## 8. Monitor (`huphup-monitor`) — файлдар

| Файл | Мақсаты |
|------|---------|
| `index.html` | Dashboard HTML (sidebar, tabs, кестелер) |
| `src/main.ts` | Polling, tabs, health/ops деректер |
| `src/charts.ts` | Latency, uptime графиктер |
| `src/style.css` | UI + mobile адаптация |
| `api/snapshot.js` | Vercel serverless — ops proxy |
| `vercel.json` | Vercel конфиг |
| `.env.example` | Env мысалы |

### Monitor не бақылайды

- Backend API health (`/api/v1/health`)
- PostgreSQL статус + latency
- Frontend (Vercel) қолжетімділігі
- Gemini API шақырулары (ops snapshot)
- API traffic, SQL queries (MONITOR_SECRET қажет)

### Monitor командалары

```bash
npm run dev       # local dev
npm run build     # production build
npm run preview   # preview
```

### Monitor environment

| Айнымалы | Сипаттама |
|----------|-----------|
| `VITE_API_HEALTH_URL` | Health endpoint URL |
| `VITE_API_OPS_URL` | Ops snapshot URL |
| `VITE_FRONTEND_URL` | Frontend URL тексеру |
| `VITE_POLL_SECONDS` | Авто-refresh интервал (сек) |

`MONITOR_SECRET` — UI-да енгізіледі (Render-де `MONITOR_SECRET` env).

---

## 9. Бизнес-flow (қадам-қадам)

```
1. Buyer тіркеледі (/register, role=BUYER)
2. Заявка жазады (/app немесе /requests/new)
3. AI талдайды (POST /requests/analyze)
4. Publish (POST /requests/:id/publish)
   → Gemini поставщілерді таңдайды
   → Lead-тар құрылады
   → Supplier-лерге notification
5. Supplier тіркеледі (/register, role=SUPPLIER)
6. Компания + тауарлар (/supplier/company, /supplier/products)
7. Lead көреді (/supplier/leads)
8. КП жібереді (offer create)
9. Buyer қабылдайды (/offers → accept)
   → Conversation ашылады
10. Чат (/conversations) — WebSocket real-time
```

---

## 10. Рөлдер

| Роль | Кабинет | Негізгі бет |
|------|---------|-------------|
| **BUYER** | `/app`, `/requests`, `/offers` | Сатып алушы |
| **SUPPLIER** | `/supplier`, `/supplier/leads` | Поставщик + CRM |
| **ADMIN** | барлық API | Әкімші (dev) |

---

## 11. Тест аккаунттар

Seed: `npm run prisma:seed` (backend папкасында)

**Пароль барлығына:** `TestPass123!`

| Email | Роль |
|-------|------|
| `buyer@huphup.test` | Buyer |
| `supplier01@huphup.test` … `supplier10@huphup.test` | Suppliers |

---

## 12. Production deploy

| Проект | Платформа | Команда |
|--------|-----------|---------|
| Backend | Render | `main`-ге push (`render.yaml` Blueprint) |
| Frontend | Vercel | `main`-ге push (Root Directory `apps/frontend`) |
| Monitor | Vercel | `main`-ге push (Root Directory `apps/monitor`) |
| DB | Neon | Render env-те `DATABASE_URL` + `DIRECT_URL` |

Толық нұсқау: [DEPLOY.md](./DEPLOY.md)

---

## 13. Байланысты құжаттама

| Файл | Мазмұны |
|------|---------|
| [DOCS.md](./DOCS.md) | API endpoints, модельдер, Gemini |
| [DEPLOY.md](./DEPLOY.md) | Neon + Render + Vercel |
| [README.md](./README.md) | Қысқа кіріспе |
| Frontend `README.md` | Frontend іске қосу |
| Monitor `README.md` | Monitor іске қосу |

---

## 14. Жиі қателер

| Мәселе | Шешім |
|--------|-------|
| Frontend API-ға қосылмайды | Backend іске қосылғанын тексеріңіз; `.env` → `VITE_API_URL` |
| CORS қате | Backend `.env` → `CORS_ORIGINS` frontend URL қосыңыз |
| DB қате | `npm run db:up` + `npm run prisma:migrate` |
| Gemini жұмыс істемейді | `GEMINI_API_KEY` толтырыңыз |
| Monitor бос | `MONITOR_SECRET` UI-да енгізіңіз |
| Порт бос емес | 5173/3000/5432 бос екенін тексеріңіз |

---

*Соңғы жаңарту: 2026-08-28*
