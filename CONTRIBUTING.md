# Как работать с репозиторием

## Ветки и PR

- `main` защищена: прямой push запрещён, только через PR.
- Ветку называем `feat/…`, `fix/…`, `chore/…`, `docs/…` + короткое описание: `feat/supplier-product-detail`.
- Один PR = одна логическая задача. Желательно в пределах одного `apps/*`.
- Merge — **squash**, заголовок коммита в повелительном наклонении: «Add…», «Fix…».
- Для влияния PR: зелёный CI + 1 апрув от código-овнера затронутой зоны (`.github/CODEOWNERS`).

## Локальная разработка

Требования: Node 24 (`nvm use`), pnpm, Docker Desktop.

```bash
pnpm install
cp apps/*/.env.example → apps/*/.env      # по одному на приложение
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- `pnpm dev` поднимает все 4 приложения через Turborepo. Логи каждого — с префиксом.
- Одно приложение: `pnpm --filter @huphup/frontend dev`.
- Postgres у каждого свой, локальный, в Docker. Общей dev-базы нет.
- Redis нужен бэкенду только для мульти-инстансного Socket.IO (`REDIS_URL`); один инстанс работает без него.

### Миграции БД

```bash
pnpm --filter @huphup/backend exec prisma migrate dev --name <что_меняем>
```

Схема `apps/backend/prisma/schema.prisma` разбита на доменные блоки. Меняй **только свой блок**,
иначе PR соберёт лишних код-овнеров и конфликты.

## Секреты

- В git попадает только `.env.example`. Реальные значения — в закрепе чата команды
  (позже — 1Password / Doppler).
- Прод-секреты живут в Railway и Vercel, не в репозитории.
- Никогда не коммить `.env`, ключи, токены. `.gitignore` это ловит, но проверяй `git status`.

## CI

`.github/workflows/ci.yml` на каждый PR: `pnpm install → prisma generate → build → test`.
Линт пока **не блокирует** (унаследованный долг) — задача убрать `continue-on-error`, когда `pnpm lint` станет зелёным.

## Деплой

| Приложение | Платформа | Root directory | Триггер |
|---|---|---|---|
| backend | Railway | `apps/backend` | push в `main` |
| frontend | Vercel | `apps/frontend` | push в `main` |
| admin | Vercel (приватный проект) | `apps/admin` | push в `main` |
| monitor | Vercel | `apps/monitor` | push в `main` |

Prisma-миграции на проде: `prisma migrate deploy` в release-шаге Railway.
Preview-деплои Vercel на каждый PR включены по умолчанию.

## Открытые задачи по монорепо (первые PR)

1. **`packages/api-types`** — вынести общие типы ответов API. Сейчас они продублированы
   в `apps/frontend/src/types` и `apps/admin/src/api/types.ts`. Сделать пакет
   `@huphup/api-types`, переключить оба фронта на него.
2. **`feat/supplier-product-detail`** — доехать фичу из веток-снапшотов:
   бэкенд `GET /products/mine/:productId` (`wip/pre-monorepo-snapshot` в старом
   `huphup-backend`) + фронт-часть (`fix/private-media-token`, коммит «Supplier product detail/form WIP»).
3. **Сверить тесты** из старой ветки `test/suite-and-fixes` с тем, что уже есть в `apps/backend`
   (proverka уже принесла много `*.spec.ts`; нужен догон недостающих).
4. **Убрать дубли деплой-конфигов**: в `apps/backend` лежат свои `docker-compose.yml`,
   `render.yaml`, `railway.json` — оставить один канонический путь.
5. **Линт до зелёного**, затем сделать job блокирующим.

## История

Все четыре приложения импортированы через `git subtree` с полной историей.
`git log -- apps/backend` показывает историю бэкенда; `git log --follow <файл>` работает.
Старые репозитории (`Bauyrzhan01/huphup-backend|frontend|monitor|admin`) — в архиве, read-only.
