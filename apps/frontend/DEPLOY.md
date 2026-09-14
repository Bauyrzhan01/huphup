# Frontend deploy (Vercel)

## Live

https://huphup-frontend.vercel.app

API: `https://huphup-api.onrender.com/api/v1`

## Redeploy

The Vercel project builds from repo `Bauyrzhan01/huphup` with Root Directory
`apps/frontend`; every push to `main` deploys.

Env `VITE_API_URL` must point at the Render API (set in Vercel project settings,
then redeploy — it is baked in at build time). Full setup: `apps/backend/DEPLOY.md`.
