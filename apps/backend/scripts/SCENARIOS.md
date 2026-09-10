# Сквозные сценарии HupHup (скрипт-сидер + реальные скрины UI)

Каждый сценарий — самостоятельный скрипт: гоняет реальный HTTP API бэкенда,
проверяет инварианты и снимает страницы фронта/админки в `screenshots/` через
headless Chrome (CDP, без npm-зависимостей).

| папка | что |
|---|---|
| [`scenario-5-suppliers`](scenario-5-suppliers/README.md) | **S1.** 1 заказчик · заявка с PDF · 5 поставщиков одного товара → лид всем 5 |
| [`scenario-marketplace-funnel`](scenario-marketplace-funnel/README.md) | **S2–S4.** 5 КП → выбор → чат → escrow-сделка; спор → возврат админом |
| [`scenario-direct-product`](scenario-direct-product/README.md) | **S5.** Прямой запрос по карточке товара → адресный лид (score 100) |
| `scenario-onboarding` | **S6.** Онбординг поставщика: регистрация → компания → товар + 2 фото → публичный каталог |
| `scenario-ai-request` | **S7.** ИИ-чат собирает заявку из свободного текста (analyze → clarify → publish) |
| `scenario-crm-lifecycle` | **S8.** Лид в CRM: open → claim → следующий шаг → заметка → задача → статус → лента активности |
| `scenario-team-invite` | **S9.** Инвайт менеджера в компанию по email → приём по ссылке → назначение лида менеджеру |
| `scenario-chat-files` | **S10.** Файлы в чате сделки: фото замера + PDF счёта, видны обеим сторонам |
| `scenario-offer-lifecycle` | **S11.** Жизненный цикл КП: отклонение заказчиком + отзыв поставщиком + акцепт |
| `scenario-deal-autorelease` | **S12.** Автовыпуск денег поставщику через 7 дней после отгрузки (молчание покупателя) |
| `scenario-deal-cancel` | **S13.** Отмена сделки до отгрузки → возврат покупателю |
| `scenario-commission` | **S14.** Комиссия площадки: админ включает DEAL_COMMISSION 5% → к выплате = сумма − комиссия |
| `scenario-insufficient-funds` | **S15.** Оплата без денег → 402 без движения средств; после пополнения проходит |
| [`scenario-lib`](scenario-lib/) | общий код: `huphup-client`, `flows` (заявка/КП/акцепт), `ensure-admin`, `db` (backdate/zero-wallet), `png`/`pdf` (генераторы вложений), `screenshot-lib` (CDP), `reset` (`--all` — полная очистка) |

## Что нужно поднять

```bash
cd C:/dev/huphup
docker compose up -d                                   # Postgres + Redis
pnpm --filter @huphup/backend exec prisma migrate deploy
pnpm --filter @huphup/backend run start                 # :3000
pnpm --filter @huphup/frontend run dev                  # :5173
pnpm --filter @huphup/admin run dev                     # :5175  (нужно для S4)
```

`GEMINI_API_KEY` в `apps/backend/.env` пуст → подбор поставщиков идёт по
keyword-матчингу (`matchReason: "keyword hits on <товар>"`); с ключом Gemini
дополнительно читает приложенный к заявке PDF.

## Как запускать

```bash
cd apps/backend/scripts/<папка>
python generate-assets.py   # только для scenario-5-suppliers
node run.mjs                # прогон + state.json / assets/last-run.json
node screenshot.mjs         # скрины
```

Между прогонами: `node apps/backend/scripts/scenario-lib/reset.mjs` — сносит
сценарные заявки/КП/сделки/чаты/кошельки (аккаунты/компании/товары остаются).

Логины всех сценарных пользователей: пароль `ScenarioPass123!`,
почты вида `buyer.profnastil@` / `s1..s5.*@` / `admin.scenario@scenario.huphup.test`.

## Автотесты

Бэкенд (`pnpm --filter @huphup/backend test`): 115 → **149**.
Фронт (`pnpm --filter @huphup/frontend test`): 36 → **38**.

- `matching.service.spec.ts` — +7: keyword-матчинг (тот, что работает без Gemini):
  лид на каждую совпавшую компанию, лучший товар компании, бонус за город,
  «ничего не совпало», прямой лид (`createDirectLead`).
- `offers.service.spec.ts` — новый, 9: `create` (гварды + перевод лида в OFFERED +
  уведомление), `accept` (отклонение прочих КП, рождение сделки и чата), `withdraw`.
- `conversations.service.spec.ts` — новый, 6: `ensureForAcceptedOffer` (создание/
  переиспользование чата, дедуп участников), `sendMessage` (пустое/не-участник/404/
  публикация события + уведомления).
- `requests.service.spec.ts` — новый, 7: `publish` (гварды + запуск подбора +
  уведомление подобранных), нумерация `HH-<n+1>`, fallback-`analyze`.
- `products/dto/product.dto.spec.ts` — новый, 4: `ProductCatalogQueryDto`
  пропускает `q`/`city`/`page`/`limit` через whitelist-пайп.
- `products.service.spec.ts` — +2: `listPublicCatalog` строит where-поиск по `q`.
- `BalancePage.test.tsx` (фронт) — +2: знаковая сумма не даёт двойной минус;
  поставщику подписан кошелёк компании.

## Баги, найденные сценариями и починенные

1. **`GET /products/catalog?q=…` → 400** «property q should not exist».
   `@Query('q')` + `@Query() pagination: PaginationQueryDto` на одном методе +
   глобальный `forbidNonWhitelisted` рубили `q`/`city`.
   → `ProductCatalogQueryDto extends PaginationQueryDto`, один `@Query()`.
2. **Поставщик на «Балансе» видел 0.** `BalancePage` дёргал `/wallets/me`
   (кошелёк по `userId`), а деньги по сейф-сделке идут на кошелёк **компании**.
   → фронт переведён на `/billing/wallet` + `/billing/transactions` (там
   `ownerForUser`: поставщику — компанийный кошелёк, остальным — личный) +
   подпись «Кошелёк компании …».
3. **`−−1 575 000 ₸`** двойной минус. `billing.move` хранит расход со знаком,
   а `BalancePage` ещё сам рисовал `−`. → берём модуль суммы.
