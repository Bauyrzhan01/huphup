# HupHup Backend — API документация

B2B маркетплейс: заказчик заявка жариялайды → Gemini поставщиктерді тауар каталогы бойынша таңдайды → поставщик КП жібереді → чат ашылады.

**Интерактивті Swagger:** `/docs`  
**Production API:** `https://api-production-8ac1f.up.railway.app/api/v1`

---

## Мазмұны

1. [Стек](#стек)
2. [Локальды іске қосу](#локальды-іске-қосу)
3. [Environment](#environment)
4. [Аутентификация](#аутентификация)
5. [Рөлдер](#рөлдер)
6. [Негізгі бизнес-flow](#негізгі-бизнес-flow)
7. [Gemini matching](#gemini-matching)
8. [API endpoints](#api-endpoints)
9. [Модельдер (Prisma)](#модельдер-prisma)
10. [Тест аккаунттар](#тест-аккаунттар)
11. [Структура проекта](#структура-проекта)
12. [Deploy](#deploy)

---

## Стек

| Компонент | Технология |
|-----------|------------|
| Framework | NestJS 11 |
| ORM | Prisma 6 |
| DB | PostgreSQL |
| Auth | JWT (Bearer) |
| AI | Google Gemini API (`gemini-flash-latest`) |
| Docs | Swagger (`/docs`) |

Архитектура: **modular monolith** — `src/` ішінде модульдер (auth, requests, matching, …).

---

## Локальды іске қосу

### 1. Postgres (Docker)

```bash
npm run db:up
cp .env.example .env
# DATABASE_URL локальді қалдырыңыз
```

### 2. Миграция + seed (опционал)

```bash
npm install
npm run prisma:migrate
npm run prisma:seed
```

### 3. Dev server

```bash
npm run start:dev
```

| URL | Мақсат |
|-----|--------|
| http://localhost:3000/api/v1 | API |
| http://localhost:3000/docs | Swagger UI |
| http://localhost:3000/api/v1/health | Health check |

---

## Environment

| Переменная | Міндетті | Сипаттама |
|------------|----------|-----------|
| `PORT` | жоқ | Default `3000` |
| `API_PREFIX` | жоқ | Default `api/v1` |
| `NODE_ENV` | жоқ | `development` / `production` |
| `DATABASE_URL` | **иә** | PostgreSQL connection string |
| `JWT_SECRET` | **иә** | Ұзын random string (prod) |
| `JWT_EXPIRES_IN` | жоқ | Default `7d` |
| `CORS_ORIGINS` | **иә** | Frontend origin(ы), үтірмен |
| `GEMINI_API_KEY` | prod үшін | AI Studio API key |
| `GEMINI_MODEL` | жоқ | Default `gemini-flash-latest` |
| `GEMINI_DAILY_TOKEN_BUDGET` | жоқ | Тәуліктік token лимиті (UTC). Асып кетсе — Gemini шақырылмайды, fallback іске қосылады |

Мысал `.env`:

```env
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/huphup?schema=public"
JWT_SECRET="your-long-secret"
JWT_EXPIRES_IN="7d"
API_PREFIX=api/v1
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
GEMINI_API_KEY="your-key"
GEMINI_MODEL="gemini-flash-latest"
```

---

## Аутентификация

Көптеген endpoint-тер **JWT Bearer** талап етеді.

### Register

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "buyer@example.com",
  "password": "SecurePass123",
  "fullName": "Иван Иванов",
  "phone": "+77001234567",
  "role": "BUYER"
}
```

`role`: `BUYER` | `SUPPLIER` | `ADMIN` (default: `BUYER`)

**Response:**

```json
{
  "user": { "id": "...", "email": "...", "fullName": "...", "role": "BUYER" },
  "accessToken": "eyJ..."
}
```

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "buyer@example.com",
  "password": "SecurePass123"
}
```

### Келесі шақырулар

```http
Authorization: Bearer <accessToken>
```

`@Public()` endpoint-тер auth талап etmeydi (кестеде белгіленген).

---

## Рөлдер

| Role | Не істей алады |
|------|----------------|
| `BUYER` | Заявка жасау, publish, offer қабылдау, чат |
| `SUPPLIER` | Компания, тауарлар, lead көру, КП жіберу, чат |
| `ADMIN` | Кеңірек read (кей endpoint-тер) |

Компания мүшелері: `OWNER` (invite, member remove) және `MANAGER` (lead, offer, product).

---

## Негізгі бизнес-flow

```
Buyer                          Backend                         Supplier
  |                               |                                |
  |-- POST /requests/analyze ---->| Gemini: title, city, qty       |
  |-- POST /requests ------------>| DRAFT заявка                   |
  |-- POST /requests/:id/publish->| Gemini match → Lead(ler)       |
  |                               |------ NEW_LEAD notification -->|
  |                               |<----- GET /leads --------------|
  |                               |<----- POST /offers -------------|
  |<---- NEW_OFFER notification --|                                |
  |-- POST /offers/:id/accept --->| Request IN_PROGRESS            |
  |                               | Conversation + members         |
  |<======== POST /conversations/:id/messages ====================>|
```

### Request status

`DRAFT` → `PUBLISHED` → `IN_PROGRESS` → `CLOSED` / `CANCELLED`

### Lead status

`NEW` → `VIEWED` → `OFFERED` / `SKIPPED`

### Offer status

`PENDING` → `ACCEPTED` / `REJECTED` / `WITHDRAWN`

---

## Gemini matching

Publish (`POST /requests/:id/publish`) кезінде:

1. Барлық **active** `Product` каталогы жүктеледі (компаниямен бірге).
2. **Gemini** заявка мәтінімен салыстырып `matches[]` қайтарады (`productId`, `companyId`, `score` 0–100).
3. Score **≥ 55** болса ғана lead құрылады.
4. Бір компаниядан **бір lead** (ең жоғары score).
5. Gemini жауап бермese — **keyword fallback** (атау/сипаттама бойынша).

Analyze (`POST /requests/analyze`) — заявка мәтінін структуралау (title, category, city, quantity, deadline). Gemini жоқ болса — rule-based fallback.

**Тұрақтылық:** желі/5xx/429 қатесі болса — 1 рет қайта көріледі (250 мс кейін). 4 сәтсіздік қатарынан болса — 30 секундқа "circuit breaker" ашылады, сол уақытта Gemini-ге мүлдем шақырылмайды, бірден fallback. Тәуліктік token лимиті асса (`GEMINI_DAILY_TOKEN_BUDGET`) — сол күн бойы да fallback. Барлық шақыру `geminiLogStore`-та (`/ops/snapshot`) көрінеді.

---

## API endpoints

Барлық жолдар `/{API_PREFIX}` астында (default: `/api/v1`).

### Health

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/health` | Public | Readiness: `{ status, service, database, dbLatencyMs, time }`. DB қолжетімсіз болса **503** |
| GET | `/health/live` | Public | Liveness: процесс тірі ме (DB-ға тимейді), әрқашан 200 |

### Platform (лендинг)

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/platform/live` | Public | Карта мен фид: `{ stats, feed, feedTotal, feedLimit, cities, pulse, flow }`. Тек жасырылмаған (`hiddenAt = null`), DRAFT емес өтінімдер; фид ең көбі 200 жол |

### Billing (баланс)

Кошелёк бір жақта: жеткізуші компанияда (`companyId`) немесе қолданушыда (`userId`).
Барлық ақша қозғалысы `wallet_transactions`-та қалады, `idempotencyKey` қайталап списание жасауға жол бермейді.

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/billing/wallet` | JWT | Балансым: жеткізушіге — компания кошелегі, сатып алушыға — жеке |
| GET | `/billing/transactions` | JWT | Проводкалар тарихы, пагинация `?page=&limit=` |
| GET | `/billing/pricing` | JWT | Маған қолданылатын бағалар (әр повод бойынша) |
| GET | `/admin/billing/wallets` | JWT (ADMIN) | Барлық кошелектер, `?q=` іздеу |
| GET | `/admin/billing/transactions` | JWT (ADMIN) | Платформадағы барлық проводка, `?reason=` |
| POST | `/admin/billing/topup` | JWT (ADMIN) | Қолмен толтыру: `{ companyId|userId, amount, comment }` |
| POST | `/admin/billing/adjust` | JWT (ADMIN) | Түзету, теріс сома да болады |
| GET | `/admin/billing/pricing` | JWT (ADMIN) | Платформа бағалары + компания бойынша ерекшеліктер |
| PUT | `/admin/billing/pricing` | JWT (ADMIN) | Бағаларды қою; `enabled: false` — әрекет тегін |

Списание поводтары (`BillingReason`): `LEAD_UNLOCK`, `OFFER_SENT`, `SUBSCRIPTION`, `DEAL_COMMISSION`, `MANUAL`.
Баға қосылмаса (`enabled: false`) немесе жоқ болса — әрекет тегін қалады.
Ақша жетпесе **402** `INSUFFICIENT_FUNDS`, баланс минуста болса **402** `WALLET_IN_DEBT`.

### Auth

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| POST | `/auth/register` | Public | Тіркелу (ADMIN рөлі тыйым) |
| POST | `/auth/login` | Public | Кіру |
| POST | `/auth/forgot-password` | Public | Reset token (dev: response-та) |
| POST | `/auth/reset-password` | Public | Token + жаңа пароль |

### Users

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/users/me` | JWT | Ағымдағы user |
| PATCH | `/users/me` | JWT | `fullName`, `phone` |
| POST | `/users/me/password` | JWT | Пароль өзгерту (ағымдағы пароль керек) |

### Companies

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| POST | `/companies` | JWT (SUPPLIER) | Компания жасау |
| GET | `/companies` | Public | Пагинация: `?page=1&limit=20&q=` → `{ items, page, limit, total, totalPages }` |
| GET | `/companies/me` | JWT | Өз компаниясы |
| GET | `/companies/me/members` | JWT | Мүшелер |
| DELETE | `/companies/me/members/:userId` | JWT (OWNER) | Мүшені шығару |
| POST | `/companies/me/invites` | JWT (OWNER) | Invite link |
| GET | `/companies/:id` | Public | Компания карточкасы |
| GET | `/companies/:id/products` | Public | Пагинация: `?page=1&limit=20` + company meta |
| PATCH | `/companies/:id` | JWT | Жаңарту |

### Invites

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/invites/:token` | Public | Invite preview |
| POST | `/invites/:token/accept` | JWT | Manager ретінде қосылу |

### Products

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/products/mine` | JWT (supplier member) | Өз каталогы |
| GET | `/products/catalog` | Public | Публичный каталог: `?page=1&limit=20&q=&city=` |
| POST | `/products` | JWT (SUPPLIER) | Тауар қосу |
| POST | `/products/ai-draft` | JWT (supplier member) | Gemini бойынша шимай жазбадан карточка жобасы (`name/description/unit/category`). Тек ұсыныс, автоматты сақтау жоқ |
| PATCH | `/products/:id` | JWT | Жаңарту |
| DELETE | `/products/:id` | JWT | Жою |

**Create product body:**

```json
{
  "name": "Цемент М400",
  "description": "Мешок 50 кг, оптом",
  "unit": "т",
  "priceFrom": 45000,
  "currency": "KZT",
  "city": "Алматы"
}
```

### Requests

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| POST | `/requests/analyze` | Public | Gemini/rule analyze |
| POST | `/requests` | JWT (BUYER) | Draft жасау |
| GET | `/requests` | JWT | Buyer заявкалары |
| GET | `/requests/:id` | JWT | Деталь (+ offers, leads) |
| PATCH | `/requests/:id` | JWT (owner) | Жаңарту |
| POST | `/requests/:id/publish` | JWT (owner) | Жариялау + matching |
| POST | `/requests/:id/cancel` | JWT (owner) | DRAFT/PUBLISHED → CANCELLED |
| POST | `/requests/:id/close` | JWT (owner) | PUBLISHED/IN_PROGRESS → CLOSED |

### Request attachments

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/requests/:requestId/attachments` | JWT (owner) | Файл тізімі |
| POST | `/requests/:requestId/attachments` | JWT (owner) | `multipart/form-data`, field `file` (max 10 MB) |
| DELETE | `/requests/:requestId/attachments/:id` | JWT (owner) | Жою |

S3 орнатылса — AWS env арқылы; әйтпесе локал `./uploads` + `GET /uploads/...`.

**Analyze body:**

```json
{ "text": "Нужен цемент М400 10 тонн в Алматы" }
```

**Publish response (қосымша):**

```json
{
  "request": { "id": "...", "code": "HH-1003", "status": "PUBLISHED", ... },
  "leadsCreated": 2,
  "matchedSuppliers": [
    {
      "companyId": "...",
      "companyName": "Алматы Цемент Опт",
      "city": "Алматы",
      "score": 95,
      "reason": "...",
      "productId": "..."
    }
  ]
}
```

### Leads (supplier)

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/leads` | JWT (supplier) | Компания lead-тары |
| POST | `/leads/:id/view` | JWT | `VIEWED` статус |
| POST | `/leads/:id/skip` | JWT (supplier) | Lead өткізу |

### Offers

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| POST | `/offers` | JWT (supplier) | КП жіберу |
| GET | `/offers/mine` | JWT (buyer) | Барлық incoming offers |
| GET | `/offers/by-request/:requestId` | JWT (buyer) | Бір заявка offers |
| POST | `/offers/:id/accept` | JWT (buyer) | Қабылдау + chat |
| POST | `/offers/:id/reject` | JWT (buyer) | КП қабылдамау |
| POST | `/offers/:id/withdraw` | JWT (supplier) | КП кері алу |
| GET | `/offers/for-company` | JWT (supplier) | Жіберген КП тізімі |

**Create offer:**

```json
{
  "requestId": "clx...",
  "price": 450000,
  "currency": "KZT",
  "deliveryDays": 3,
  "comment": "Есть в наличии"
}
```

**Accept response:**

```json
{
  "offerId": "...",
  "conversationId": "...",
  "dealId": "..."
}
```

### Deals (сейф-сделка / escrow)

КП қабылданғанда `Deal` `AWAITING_PAYMENT` статусымен құрылады. Ақша тек `pay` кезінде ауысады:
`AWAITING_PAYMENT → HELD → SHIPPED → RELEASED`, кез келген сатыда `DISPUTED`/`REFUNDED` болуы мүмкін.

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/deals` | JWT | Өз сделкаларым (buyer — өзінікі, supplier — компаниясының) |
| GET | `/deals/:id` | JWT | Сделка карточкасы |
| POST | `/deals/:id/pay` | JWT (buyer) | Ақша HupHup-та ұсталымға өтеді |
| POST | `/deals/:id/ship` | JWT (supplier) | Жөнелту белгісі, 7 күндік автовыпуск таймері іске қосылады |
| POST | `/deals/:id/confirm` | JWT (buyer) | Алғанын растау — ақша поставщикке өтеді |
| POST | `/deals/:id/cancel` | JWT | Тек жөнелтуге дейін, ақша қайтады |
| POST | `/deals/:id/dispute` | JWT | Дау ашу — автовыпуск тоқтайды |
| GET | `/admin/deals` | JWT (ADMIN) | Барлық сделкалар, `?status=` фильтр |
| GET | `/admin/deals/:id/ai-summary` | JWT (ADMIN) | Gemini бойынша дау түсіндірмесі мен ұсынысы (`RELEASE`/`REFUND`/`NEEDS_INFO`). Тек ұсыныс — ешнәрсе шешпейді |
| POST | `/admin/deals/:id/release` | JWT (ADMIN) | Ақшаны поставщикке беру |
| POST | `/admin/deals/:id/refund` | JWT (ADMIN) | Ақшаны сатып алушыға қайтару |

### Conversations

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/conversations` | JWT | User диалогтары (+ participants) |
| GET | `/conversations/:id/messages` | JWT | Пагинация: `?limit=30&after=&before=` → `{ items, hasMore, nextCursor }` |
| GET | `/conversations/:id/stream` | JWT (query) | **SSE** real-time: `?access_token=<JWT>` |
| POST | `/conversations/:id/messages` | JWT | Жіberу (max 4000 символ) |

**Send message:**

```json
{ "body": "Здравствуйте, когда можете доставить?" }
```

Чат **SSE** (`EventSource`) немесе HTTP polling. Offer accept кезінде `REQUEST_CHAT` conversation ашылады (buyer + supplier company members).

**SSE клиент (мысал):**

```javascript
const es = new EventSource(
  `${API}/conversations/${id}/stream?access_token=${token}`
);
es.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  // append to UI
});
```

### Notifications

| Method | Path | Auth | Сипаттама |
|--------|------|------|-----------|
| GET | `/notifications` | JWT | Соңғы 50 |
| POST | `/notifications/:id/read` | JWT | Оқылды |

Типтер: `NEW_LEAD`, `NEW_OFFER`, `OFFER_ACCEPTED`, `NEW_MESSAGE`, `SYSTEM`.

---

## Модельдер (Prisma)

Негізгі кестелер:

| Model | Мақсат |
|-------|--------|
| `User` | email, role, passwordHash |
| `Company` | supplier компания |
| `CompanyMember` | OWNER / MANAGER |
| `CompanyInvite` | one-time invite token |
| `Product` | supplier каталог (Gemini matching үшін) |
| `Request` | buyer заявка (`code` уникал: `HH-1001`) |
| `Lead` | request ↔ company match |
| `Offer` | supplier КП |
| `Conversation` | 1:1 request chat |
| `Message` | чат хабарламасы |
| `Notification` | in-app хабарлама |

Схема: `prisma/schema.prisma`

---

## Тест аккаунттар

Seed: `npm run prisma:seed` (Neon/production үшін `DATABASE_URL` орнатып)

**Пароль барлығына:** `TestPass123!`

| Email | Роль |
|-------|------|
| buyer@huphup.test | Buyer |
| supplier01@huphup.test … supplier10@huphup.test | Suppliers (әр түрлі каталог) |

---

## Структура проекта

```
src/
  auth/           JWT, register, login
  users/          профиль
  companies/      компания, members, invites
  products/       supplier каталог
  requests/       analyze, CRUD, publish
  matching/       Gemini leads
  gemini/         Gemini API client
  offers/         КП
  conversations/  чат + SSE
  attachments/    request файлы
  storage/        S3 / local uploads
  notifications/
  health/
  prisma/         PrismaService
prisma/
  schema.prisma
  migrations/
  seed.ts         10 suppliers + buyer
```

---

## Deploy

Production орнату: [DEPLOY.md](./DEPLOY.md)

Қысқаша:

- **DB:** Neon PostgreSQL
- **API:** Railway (`npm run start:prod` → migrate + start)
- **Frontend:** Vercel → `VITE_API_URL` → Railway API

---

## Scripts

```bash
npm run start:dev      # dev + hot reload
npm run build          # prisma generate + nest build
npm run start:prod     # migrate deploy + node dist/main
npm run prisma:migrate # local migration
npm run prisma:seed    # test data
npm run prisma:studio  # DB GUI
npm run db:up          # docker postgres
```

---

## Кейінге (roadmap)

- Email жіберу (password reset)
- Redis (cache, rate limit)
- Admin panel API
- E2E tests

---

## Swagger

Локаль: http://localhost:3000/docs  
Production: https://api-production-8ac1f.up.railway.app/docs

Swagger-да **Authorize** → `Bearer <token>` қойып, барлық endpoint-терді тікелей тест жасауға болады.
