# HupHup Backend

B2B маркетплейс API (NestJS + PostgreSQL + Prisma).

Фронт пен база **бөлек** орналасады. Бұл репо — тек backend.

## Документация

| Файл | Мазмұны |
|------|---------|
| **[DOCS.md](./DOCS.md)** | Толық API, flow, модельдер, Gemini, env |
| **[DEPLOY.md](./DEPLOY.md)** | Neon + Render + Vercel deploy |
| **Swagger** | `/docs` (интерактивті API) |

**Live API:** https://huphup-api.onrender.com/api/v1  
**Live Swagger:** https://huphup-api.onrender.com/docs

## Архитектура

- Modular monolith
- PostgreSQL (басқа құрылғы / сервер)
- JWT auth
- Swagger: `/docs`

## Модульдер

| Module | Не істейді |
|--------|------------|
| `auth` | register / login / JWT |
| `users` | профиль |
| `companies` | профиль поставщика |
| `requests` | заявка + AI analyze + publish |
| `matching` | Gemini lead мэтчинг (тауар каталогы) |
| `gemini` | Google Gemini API клиент |
| `offers` | ұсыныстар + accept |
| `conversations` | чат (HTTP; WebSocket кейін) |
| `notifications` | хабарламалар |
| `health` | API + DB статус |

## Іске қосу

### 1) Env

```bash
cp .env.example .env
```

`DATABASE_URL`-ды Postgres тұрған хостқа қойыңыз:

```env
DATABASE_URL="postgresql://USER:PASSWORD@DB_HOST:5432/huphup?schema=public"
```

Фронт басқа құрылғыда болса:

```env
CORS_ORIGINS="http://FRONTEND_IP:5173"
```

Backend басқа құрылғыдан қолжетімді болу үшін `0.0.0.0`-да тыңдайды.

#### Жергілікті және командалық база арасында ауысу

Екі базамен жұмыс істесеңіз, `.env.local` (Docker-дегі өз базаңыз) және
`.env.shared` (команданың бұлттағы базасы) файлдарын жасап қойыңыз. Екеуі де
git-ке кірмейді. Ауысу:

```bash
npm run env:local    # .env.local → .env
npm run env:shared   # .env.shared → .env
```

Ауысқаннан кейін сервер мен Prisma Studio-ны қайта қосыңыз.

### 2) Миграция

Postgres дайын болғанда:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 3) Dev server

```bash
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

## Негізгі flow

1. Buyer `POST /auth/register` (`role: BUYER`)
2. `POST /requests/analyze` → категория/қала/саны
3. `POST /requests` → draft
4. `POST /requests/:id/publish` → lead-тар құрылады
5. Supplier `POST /auth/register` (`role: SUPPLIER`) + `POST /companies`
6. `GET /leads` → `POST /offers`
7. Buyer `POST /offers/:id/accept` → conversation ашылады
8. `POST /conversations/:id/messages`

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Келесі қадамдар

1. Postgres қосу (басқа машина) + migrate
2. Backend-ті осы құрылғыда іске қосу
3. Frontend-ті бөлек папка/құрылғыда дизайн бойынша жасау
4. Тесттер өткен соң серверге шығару
5. Кейін: Redis, WebSocket chat, S3 файлдар

Толық API: [DOCS.md](./DOCS.md)
