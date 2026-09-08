/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_HEALTH_URL?: string;
  readonly VITE_API_OPS_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_POLL_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
