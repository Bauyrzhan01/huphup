# Temporary cloud deploy (Neon + Railway + Vercel)

## Live demo URLs

| Service | URL |
|---------|-----|
| **Frontend** | https://huphup-frontend.vercel.app |
| **API** | https://api-production-8ac1f.up.railway.app/api/v1 |
| **Health** | https://api-production-8ac1f.up.railway.app/api/v1/health |
| **Swagger** | https://api-production-8ac1f.up.railway.app/docs |
| **Neon DB** | project `huphup-demo` (migrations applied) |

Smoke test: open the frontend → login as buyer → create request → publish → matched suppliers see leads.

## Test accounts (Neon seed)

Password for all: `TestPass123!`

| Role | Email |
|------|-------|
| Buyer | `buyer@huphup.test` |
| Supplier 01 (цемент) | `supplier01@huphup.test` |
| Supplier 02 (мебель) | `supplier02@huphup.test` |
| Supplier 03 (продукты) | `supplier03@huphup.test` |
| Supplier 04 (электроника) | `supplier04@huphup.test` |
| Supplier 05 (сантехника) | `supplier05@huphup.test` |
| Supplier 06 (упаковка) | `supplier06@huphup.test` |
| Supplier 07 (текстиль) | `supplier07@huphup.test` |
| Supplier 08 (авто) | `supplier08@huphup.test` |
| Supplier 09 (химия) | `supplier09@huphup.test` |
| Supplier 10 (IT) | `supplier10@huphup.test` |

Reseed: `DATABASE_URL=<neon> npx prisma db seed`

## Stack

```
User → Vercel (React) → Railway (NestJS) → Neon (Postgres)
```

## Recreate / redeploy

### Neon
1. https://console.neon.tech → project connection string
2. Locally:
   ```bash
   cd huphup-backend
   # set DATABASE_URL
   npx prisma migrate deploy
   ```

### Railway (API)
```bash
cd huphup-backend
npx @railway/cli login
npx @railway/cli up
```

Variables on service `api`:
- `DATABASE_URL` — Neon pooled URL (`?sslmode=require`)
- `JWT_SECRET` — long random
- `JWT_EXPIRES_IN=7d`
- `API_PREFIX=api/v1`
- `NODE_ENV=production`
- `CORS_ORIGINS=https://huphup-frontend.vercel.app,...`
- `GEMINI_API_KEY` — Google AI Studio key
- `GEMINI_MODEL=gemini-flash-latest` (optional)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` — optional S3 uploads

### Vercel (frontend)
```bash
cd huphup-frontend
npx vercel login
npx vercel --prod
```

Env:
- `VITE_API_URL=https://api-production-8ac1f.up.railway.app/api/v1`

`vercel.json` rewrites SPA routes to `/index.html`.

## After changing Vercel URL

Update Railway `CORS_ORIGINS` to include the new origin, then redeploy/restart the API.
