# Сценарий: 1 заказчик · заявка с PDF · 5 поставщиков одного товара

Проверяет сквозной путь HupHup: заказчик создаёт заявку и прикладывает PDF →
бэкенд подбирает поставщиков → lead падает во «Входящие» **каждому** из 5
поставщиков, у которых один и тот же товар («Профнастил С8») с разными
описанием, ценой и фото.

## Что внутри

| файл | что делает |
|---|---|
| `generate-assets.py` | генерит `assets/`: PDF-спецификацию заказчика, 5 фото товара, 5 карточек-PDF поставщиков |
| `run.mjs` | весь сценарий через HTTP API: заказчик + 5 поставщиков + компании + товары + фото + заявка + PDF + публикация; печатает «Входящие» каждого; пишет `assets/last-run.json` |
| `screenshot.mjs` | headless Chrome (CDP, без npm-зависимостей): логинит каждого через `localStorage` и снимает страницы в `screenshots/` |
| `assets/` | сгенерированные файлы + `last-run.json` (полный отчёт последнего прогона) |
| `screenshots/` | `00` — заявка глазами заказчика («Подобранные поставщики (5)»); `01..05` — «Входящие» каждого поставщика с заявкой `HH-xxxx` |

## Запуск

```bash
# 0. поднять стек (из корня монорепо C:\dev\huphup)
docker compose up -d                              # Postgres + Redis
pnpm --filter @huphup/backend exec prisma migrate deploy
pnpm --filter @huphup/backend run start           # бэкенд :3000
pnpm --filter @huphup/frontend run dev            # фронт :5173

# 1. сгенерить файлы товара/заявки
cd apps/backend/scripts/scenario-5-suppliers
python generate-assets.py

# 2. прогнать сценарий (идемпотентно: повторный запуск переиспользует
#    аккаунты/компании/товары и создаёт новую заявку)
node run.mjs

# 3. снять скрины
node screenshot.mjs
```

## Данные сценария

- Товар у всех 5 поставщиков: **«Профнастил С8»** (разные цвет/толщина/покрытие/цена/фото).
- Заявка заказчика: профнастил С8 оцинкованный, 800 листов, Алматы, самовывоз,
  срок 30.09.2026 + приложен `buyer-request-profnastil.pdf`.
- Логины (пароль у всех `ScenarioPass123!`):
  - заказчик `buyer.profnastil@scenario.huphup.test`
  - поставщики `s1.stroymetall@` … `s5.aktorgmetall@scenario.huphup.test`

## Как работает подбор

`RequestsService.publish` → `MatchingService.createLeadsForRequest`:
1. пробует Gemini (`GeminiService.matchProducts`, читает и приложенный PDF);
2. **без `GEMINI_API_KEY`** (текущий локальный `.env`) — падает на keyword-матчинг
   по названию/описанию товара против текста заявки. Общие слова
   («профнастил», «оцинкованный», «кровля», «лист», «Алматы» …) есть у всех 5
   товаров → все 5 получают lead со `score 100` и `matchReason = "keyword hits on Профнастил С8"`.

> Карточка товара поставщика в API принимает только изображения, не PDF —
> поэтому PDF-и поставщиков (`supplier-*-spec.pdf`) лежат в `assets/` как
> отдельные документы, а к заявке заказчика PDF прикладывается штатно
> (`POST /requests/:id/attachments`).

## Существующие тесты в репозитории (`pnpm --filter @huphup/backend test`)

Юнит/интеграционные Jest-спеки (`*.spec.ts`), не e2e:
`matching.service.spec` (в т.ч. подмешивание PDF/фото в Gemini),
`gemini.service.spec`, `products.service.spec`, `billing.service.spec`,
`deals.service.spec`, `chat.gateway.spec`, `chat-events.service.spec`,
`platform.service.spec`, `health.controller.spec`, `cors.spec`, `text.util.spec`,
`gemini-log.store.spec`. Плюс `test/app.e2e-spec.ts` (только health + 401).
Фронт: `client.test`, `subscribeStream.test`, `AuthContext.test`,
`BalancePage.test`, `DealsPage.test` (vitest).

Этот сценарий — отдельный runnable-скрипт, в jest не подключён.
