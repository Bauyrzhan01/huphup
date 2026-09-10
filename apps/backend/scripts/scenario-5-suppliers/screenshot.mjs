#!/usr/bin/env node
/**
 * Делает скриншоты сценария через headless Chrome (CDP, без npm-зависимостей).
 *
 * Для каждого пользователя: кладёт его JWT в localStorage, открывает страницу
 * и снимает её целиком в ./screenshots.
 *
 *   00 — заказчик: страница заявки, блок «Подобранные поставщики (5)»
 *   01..05 — каждый поставщик: /supplier/leads с открытой входящей заявкой
 *
 * Запуск:  node screenshot.mjs      (данные берёт из assets/last-run.json)
 * Требует: установленный Chrome/Edge, поднятый фронт (FRONT) и бэк (API_BASE).
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'screenshots');
const FRONT = process.env.FRONT || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'ScenarioPass123!';
const PORT = 9333;
const VIEWPORT = { width: 1440, height: 1000 };
const SCALE = 2;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const findChrome = () => {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Chrome/Edge не найден');
};

// --- крошечный CDP-клиент поверх встроенного WebSocket ----------------------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const l of [...this.listeners]) l(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const p = { id, method, params };
    if (sessionId) p.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(p));
    });
  }
  once(method, sessionId) {
    return new Promise((resolve) => {
      const l = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve(msg.params);
        }
      };
      this.listeners.push(l);
    });
  }
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return (await res.json()).accessToken;
}

async function leadIdFor(token, requestId) {
  const res = await fetch(`${API}/leads`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const leads = await res.json();
  const l = leads.find((x) => (x.request?.id || x.requestId) === requestId);
  return l?.id ?? null;
}

async function main() {
  const summary = JSON.parse(await readFile(join(HERE, 'assets', 'last-run.json'), 'utf8'));
  const reqId = summary.request.id;
  const reqCode = summary.request.code;

  const shots = [
    { name: `00-zakazchik-${reqCode}-podobrano-5-postavshikov`, email: summary.buyer, path: `/requests/${reqId}` },
  ];
  for (const [i, s] of summary.suppliers.entries()) {
    const token = await login(s.email);
    const leadId = await leadIdFor(token, reqId);
    const slug = s.email.split('@')[0];
    shots.push({
      name: `0${i + 1}-${slug}-vhodyashchie-${reqCode}`,
      email: s.email,
      company: s.company,
      token,
      path: leadId ? `/supplier/leads?leadId=${leadId}` : '/supplier/leads',
    });
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const userDataDir = join(os.tmpdir(), `huphup-shot-${Date.now()}`);
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let version;
    for (let i = 0; i < 60; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('Chrome DevTools endpoint не поднялся');

    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: SCALE, mobile: false },
      sessionId,
    );

    const made = [];
    for (const shot of shots) {
      const token = shot.token || (await login(shot.email));

      const l1 = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url: `${FRONT}/login` }, sessionId);
      await Promise.race([l1, sleep(8000)]);
      await cdp.send(
        'Runtime.evaluate',
        { expression: `localStorage.setItem('huphup_token', ${JSON.stringify(token)}); true` },
        sessionId,
      );

      const l2 = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url: `${FRONT}${shot.path}` }, sessionId);
      await Promise.race([l2, sleep(8000)]);
      await sleep(3800); // React render + data fetch + lead auto-open

      const m = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
      const h = Math.min(4200, Math.ceil(m.cssContentSize?.height || VIEWPORT.height));
      const w = Math.ceil(m.cssContentSize?.width || VIEWPORT.width);

      const { data } = await cdp.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } },
        sessionId,
      );
      const file = join(OUT, `${shot.name}.png`);
      await writeFile(file, Buffer.from(data, 'base64'));
      made.push(shot.name);
      console.log(`  ✓ ${shot.name}.png  ${w}×${h}  — ${shot.company || 'заказчик'}`);
    }

    ws.close();
    console.log(`\nГотово: ${made.length} скринов в screenshots/`);
  } finally {
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error('screenshot.mjs упал:', e.message);
  process.exit(1);
});
