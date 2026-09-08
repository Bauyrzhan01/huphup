# HupHup

B2B-маркетплейс: покупатель создаёт заявку → AI (Gemini) подбирает поставщиков →
поставщики присылают КП → чат → сейф-сделка (эскроу).

Монорепозиторий. Все четыре приложения, общие типы и инфраструктура — здесь.

## Что внутри

| Путь | Что это | Прод |
|------|---------|------|
| [`apps/backend`](apps/backend) | NestJS + Prisma + PostgreSQL. REST API `/api/v1`, WebSocket-чат, Swagger `/docs` | Railway |
| [`apps/frontend`](apps/frontend) | React 19 + Vite. Основной сайт (кабинеты buyer / supplier) | Vercel |
| [`apps/admin`](apps/admin) | React 19 + Vite. Админка: кошельки, биллинг, транзакции, цены, сделки | Vercel (приватный) |
| [`apps/monitor`](apps/monitor) | Vite. Дашборд статуса API и БД | Vercel |
| [`packages/api-types`](packages/api-types) | Общие TypeScript-типы API (в работе — см. CONTRIBUTING.md) | — |

## Быстрый старт

Нужно: **Node 24** (см. `.nvmrc`), **pnpm** (`npm i -g pnpm`), **Docker Desktop**.

```bash
git clone git@github.com:huphup/huphup.git
cd huphup
pnpm install

# каждому приложению нужен свой .env
cp apps/backend/.env.example  apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/admin/.env.example    apps/admin/.env
cp apps/monitor/.env.example  apps/monitor/.env
# в apps/backend/.env впиши GEMINI_API_KEY и JWT_SECRET (см. закреп в чате команды)

pnpm db:up            # PostgreSQL (+ Redis) в Docker
pnpm db:migrate       # накатить схему
pnpm db:seed          # тестовые данные (buyer@huphup.test / supplier01..10, пароль TestPass123!)

pnpm dev              # все приложения разом через Turborepo
```

Порты: frontend `5173`, backend `3000` (Swagger `3000/docs`), monitor `5174`, admin `5175`, Postgres `5432`.

## Команды

```bash
pnpm dev                      # все приложения
pnpm --filter @huphup/backend dev     # только одно
pnpm build                    # сборка всех
pnpm test                     # тесты всех
pnpm lint                     # линт всех
pnpm db:up / db:down          # инфраструктура
```

## Как мы работаем

Ветка от `main` → PR → зелёный CI + 1 апрув → squash merge. Подробнее — [CONTRIBUTING.md](CONTRIBUTING.md).

## Документация

- Платформа целиком: [`apps/backend/DOCUMENTATION.md`](apps/backend/DOCUMENTATION.md)
- API (endpoints, модели, Gemini): [`apps/backend/DOCS.md`](apps/backend/DOCS.md)
- Деплой: [`apps/backend/DEPLOY.md`](apps/backend/DEPLOY.md)
