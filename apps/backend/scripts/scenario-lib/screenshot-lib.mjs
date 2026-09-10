/**
 * Скриншотилка на headless Chrome через CDP — без npm-зависимостей
 * (Node 20+: глобальный WebSocket, fetch).
 *
 *   await capture(outDir, [
 *     { name, origin, path, storage?, session?, wait? },
 *     ...
 *   ])
 *
 * origin  — база фронта (http://localhost:5173 или :5175)
 * storage — что положить в localStorage перед навигацией (напр. { huphup_token })
 * session — что положить в sessionStorage (напр. { huphup_admin_user: '{...}' })
 * path    — маршрут внутри origin
 */
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.CDP_PORT || 9333);
const VIEWPORT = { width: 1440, height: 1000 };
const SCALE = 2;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const findChrome = () => {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Chrome/Edge не найден — поставьте Chrome или задайте путь');
};

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.contextId = undefined; // свежайший default-контекст главного фрейма
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.executionContextCreated') {
        const ctx = msg.params?.context;
        if (ctx && (ctx.auxData?.isDefault ?? true)) this.contextId = ctx.id;
      } else if (msg.method === 'Runtime.executionContextsCleared') {
        this.contextId = undefined;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const l of [...this.listeners]) l(msg);
      }
    });
  }
  /** evaluate в актуальном контексте страницы (переживает навигацию) */
  eval(expression, sessionId) {
    const params = { expression, returnByValue: true };
    if (this.contextId != null) params.contextId = this.contextId;
    return this.send('Runtime.evaluate', params, sessionId).catch(async (e) => {
      // контекст устарел между вызовами — сбрасываем и пробуем без него
      if (String(e).includes('context')) {
        this.contextId = undefined;
        return this.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
      }
      throw e;
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

export async function capture(outDir, shots) {
  await mkdir(outDir, { recursive: true });

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

  const made = [];
  try {
    let version;
    for (let i = 0; i < 80; i++) {
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

    // прогрев: первая навигация в свежей сессии иногда оставляет Runtime без
    // актуального контекста — гоняем пустышку, чтобы contextId устаканился
    if (shots[0]) {
      const lw = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url: `${shots[0].origin}/login` }, sessionId);
      await Promise.race([lw, sleep(9000)]);
      await sleep(1500);
      for (let i = 0; i < 5; i++) {
        const r = await cdp.eval('document.readyState', sessionId);
        if (r.result?.value === 'complete') break;
        await sleep(600);
      }
    }

    let priming = null; // id скрипта, что кладёт токены до JS страницы
    for (const shot of shots) {
      const origin = shot.origin;

      // Кладём localStorage/sessionStorage ДО того, как выполнится код SPA —
      // через addScriptToEvaluateOnNewDocument, иначе AuthProvider успевает
      // прочитать пустое хранилище и уводит на /login.
      const setStorage =
        Object.entries(shot.storage || {})
          .map(([k, v]) => `try{localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))})}catch(e){}`)
          .join('') +
        Object.entries(shot.session || {})
          .map(([k, v]) => `try{sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))})}catch(e){}`)
          .join('');
      if (priming) {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: priming }, sessionId);
        priming = null;
      }
      if (setStorage) {
        const { identifier } = await cdp.send(
          'Page.addScriptToEvaluateOnNewDocument',
          { source: setStorage },
          sessionId,
        );
        priming = identifier;
      }

      const l2 = cdp.once('Page.loadEventFired', sessionId);
      await cdp.send('Page.navigate', { url: `${origin}${shot.path}` }, sessionId);
      await Promise.race([l2, sleep(9000)]);
      await sleep(shot.wait ?? 3800);

      // необязательные клики по элементам с заданным текстом (фильтр-чип, строка)
      const clicks = shot.clickText
        ? Array.isArray(shot.clickText) ? shot.clickText : [shot.clickText]
        : [];
      for (const t of clicks) {
        const expr = `(() => {
          const t = ${JSON.stringify(t)};
          const els = [...document.querySelectorAll('button,a,[role="button"],.chip,li,.deal-row,tr,td')];
          const exact = els.filter((e) => e.textContent.trim() === t);
          const clickable = exact.find((e) => e.matches('button,a,[role="button"],.chip'));
          const el = clickable || exact[0] || els.find((e) => e.textContent.includes(t));
          if (!el) return 'not-found: ' + t;
          el.scrollIntoView({ block: 'center' });
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          if (typeof el.click === 'function') el.click();
          return 'clicked: ' + el.tagName + '.' + (el.className || '') + ' « ' + el.textContent.trim().slice(0, 40) + ' »';
        })()`;
        let out = '';
        for (let attempt = 0; attempt < 10; attempt++) {
          const r = await cdp.eval(expr, sessionId);
          out = r.result?.value ?? '';
          if (!out.startsWith('not-found')) break;
          if (process.env.SHOT_DEBUG && attempt === 0) {
            const d = await cdp.eval('JSON.stringify([...document.querySelectorAll("button,.chip,a")].map(e=>e.textContent.trim()).filter(Boolean).slice(0,20))', sessionId);
            console.log(`       [dbg buttons] ${d.result?.value}`);
          }
          await sleep(1000);
        }
        if (process.env.SHOT_DEBUG) console.log(`     click(${JSON.stringify(t)}) -> ${out}`);
        await sleep(shot.clickWait ?? 1800);
      }

      const m = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
      const h = Math.min(shot.maxHeight ?? 4600, Math.ceil(m.cssContentSize?.height || VIEWPORT.height));
      const w = Math.ceil(m.cssContentSize?.width || VIEWPORT.width);
      const { data } = await cdp.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } },
        sessionId,
      );
      const file = join(outDir, `${shot.name}.png`);
      await writeFile(file, Buffer.from(data, 'base64'));
      made.push(shot.name);
      console.log(`  \x1b[32m✓\x1b[0m ${shot.name}.png  ${w}×${h}  ${shot.note || ''}`);
    }
    ws.close();
  } finally {
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
  return made;
}
