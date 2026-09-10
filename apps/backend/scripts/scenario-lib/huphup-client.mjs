/**
 * Общие помощники для сценарных скриптов HupHup: тонкая обёртка над HTTP API
 * бэкенда + пара утилит вывода. Без внешних зависимостей (Node 20+: fetch,
 * FormData, Blob уже глобальные).
 */
import { readFile } from 'node:fs/promises';

export const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api/v1';
export const FRONT = process.env.FRONT || 'http://localhost:5173';
export const ADMIN_FRONT = process.env.ADMIN_FRONT || 'http://localhost:5175';
export const PASSWORD = 'ScenarioPass123!';

// ---- вывод -----------------------------------------------------------------
export const c = {
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  info: (m) => console.log(`  \x1b[36m·\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m${m}\x1b[0m`),
  fail: (m) => console.log(`  \x1b[31m✗ ${m}\x1b[0m`),
};

// ---- HTTP ----------------------------------------------------------------
export async function apiJson(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

export async function apiUpload(path, token, filePath, filename) {
  const buf = await readFile(filePath);
  const type = filename.endsWith('.pdf')
    ? 'application/pdf'
    : filename.endsWith('.png')
      ? 'image/png'
      : 'application/octet-stream';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), filename);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

export function must(res, what) {
  if (!res.ok) {
    throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// ---- аккаунты ----------------------------------------------------------
export async function registerOrLogin(email, fullName, role) {
  const reg = await apiJson('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, fullName, role },
  });
  if (reg.ok) return { token: reg.data.accessToken, user: reg.data.user, fresh: true };
  if (reg.status === 409) {
    const login = await apiJson('/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
    });
    must(login, `login ${email}`);
    return { token: login.data.accessToken, user: login.data.user, fresh: false };
  }
  throw new Error(`register ${email}: HTTP ${reg.status} ${JSON.stringify(reg.data)}`);
}

export async function login(email, password = PASSWORD) {
  const res = await apiJson('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  must(res, `login ${email}`);
  return { token: res.data.accessToken, user: res.data.user };
}

export async function ensureCompany(token, dto) {
  const created = await apiJson('/companies', { method: 'POST', token, body: dto });
  if (created.ok) return created.data;
  if (created.status === 409) {
    const mine = await apiJson('/companies/me', { token });
    must(mine, 'GET /companies/me');
    return mine.data;
  }
  throw new Error(`company: HTTP ${created.status} ${JSON.stringify(created.data)}`);
}

export async function ensureProduct(token, dto) {
  const mine = await apiJson('/products/mine', { token });
  if (mine.ok && Array.isArray(mine.data)) {
    const found = mine.data.find((p) => p.name === dto.name);
    if (found) return { product: found, fresh: false };
  }
  const created = await apiJson('/products', { method: 'POST', token, body: dto });
  must(created, 'POST /products');
  return { product: created.data, fresh: true };
}

export async function health() {
  const h = await apiJson('/health/live');
  if (!h.ok) throw new Error(`бэкенд недоступен на ${API_BASE}`);
  return h.data;
}
