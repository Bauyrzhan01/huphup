# Frontend deploy (Vercel)

## Live

https://huphup-frontend.vercel.app

API: `https://api-production-8ac1f.up.railway.app/api/v1`

## Redeploy

```bash
cd huphup-frontend
npx vercel --prod
```

Env `VITE_API_URL` must point at the Railway API (set in Vercel project settings).
