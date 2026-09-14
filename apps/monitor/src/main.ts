import './style.css';
import {
  avg,
  drawBarChart,
  drawDonut,
  drawLineChart,
  drawStatusTimeline,
  minMax,
} from './charts';

type HealthPayload = {
  status?: string;
  service?: string;
  database?: 'up' | 'down';
  dbLatencyMs?: number | null;
  time?: string;
  uptimeSec?: number;
  memoryMb?: number;
  nodeVersion?: string;
};

type CheckRow = {
  at: string;
  apiOk: boolean;
  dbOk: boolean;
  frontendOk: boolean | null;
  http: number;
  latencyMs: number | null;
  dbLatencyMs: number | null;
  health?: HealthPayload;
  error?: string;
};

const API_URL =
  import.meta.env.VITE_API_HEALTH_URL ??
  'https://huphup-api.onrender.com/api/v1/health';
const OPS_URL =
  import.meta.env.VITE_API_OPS_URL ??
  API_URL.replace(/\/health\/?$/, '/ops/snapshot');
const FRONTEND_URL =
  import.meta.env.VITE_FRONTEND_URL ?? 'https://huphup-frontend.vercel.app';
const POLL_SECONDS = Number(import.meta.env.VITE_POLL_SECONDS ?? 10);
const MAX_HISTORY = 120;
const SECRET_KEY = 'huphup_monitor_secret';

const history: CheckRow[] = [];
let timer: number | undefined;
let lastHealth: HealthPayload | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  pollLabel: $('poll-label'),
  refreshBtn: $('refresh-btn') as HTMLButtonElement,
  overallBadge: $('overall-badge'),
  lastCheck: $('last-check'),
  sideStatus: $('side-status'),
  apiStatus: $('api-status'),
  apiDetail: $('api-detail'),
  dbStatus: $('db-status'),
  dbDetail: $('db-detail'),
  frontendStatus: $('frontend-status'),
  frontendDetail: $('frontend-detail'),
  uptimeStatus: $('uptime-status'),
  uptimeDetail: $('uptime-detail'),
  statApi: $('stat-api'),
  statDb: $('stat-db'),
  statFrontend: $('stat-frontend'),
  statUptime: $('stat-uptime'),
  historyBody: $('history-body'),
  historyCount: $('history-count'),
  lastError: $('last-error'),
  infoService: $('info-service'),
  infoTime: $('info-time'),
  infoUptime: $('info-uptime'),
  infoMemory: $('info-memory'),
  infoNode: $('info-node'),
  infoOverall: $('info-overall'),
  statApiAvg: $('stat-api-avg'),
  statApiRange: $('stat-api-range'),
  statDbAvg: $('stat-db-avg'),
  statDbRange: $('stat-db-range'),
  donutPct: $('donut-pct'),
  legOk: $('leg-ok'),
  legFail: $('leg-fail'),
  epApi: $('ep-api'),
  epFrontend: $('ep-frontend'),
  epPoll: $('ep-poll'),
  epHistory: $('ep-history'),
  epSwagger: $('ep-swagger'),
  chartLatency: $('chart-latency') as HTMLCanvasElement,
  chartStatus: $('chart-status') as HTMLCanvasElement,
  chartDonut: $('chart-donut') as HTMLCanvasElement,
  chartHistoryBar: $('chart-history-bar') as HTMLCanvasElement,
  secretInput: $('secret-input') as HTMLInputElement,
  secretSave: $('secret-save'),
  opsLock: $('ops-lock'),
  opsBanner: $('ops-banner'),
  trafficBody: $('traffic-body'),
  sqlBody: $('sql-body'),
  tableCounts: $('table-counts'),
  dbRequests: $('db-requests'),
  dbLeads: $('db-leads'),
  dbCatalog: $('db-catalog'),
  dbAct: $('db-act'),
  frontendBody: $('frontend-body'),
  feBase: $('fe-base'),
  trTotal: $('tr-total'),
  trMin: $('tr-min'),
  trCodes: $('tr-codes'),
  trSql: $('tr-sql'),
  geminiStatus: $('gemini-status'),
  geminiDetail: $('gemini-detail'),
  statGemini: $('stat-gemini'),
  geConfigured: $('ge-configured'),
  geModel: $('ge-model'),
  geProbe: $('ge-probe'),
  geProbeMeta: $('ge-probe-meta'),
  geOkfail: $('ge-okfail'),
  geTotal: $('ge-total'),
  geAvg: $('ge-avg'),
  geMin: $('ge-min'),
  geminiBody: $('gemini-body'),
};

function getSecret() {
  return localStorage.getItem(SECRET_KEY) ?? '';
}

function feed(items: string[]) {
  if (!items.length) return '<p class="stat-meta">Бос</p>';
  return items.map((html) => `<article>${html}</article>`).join('');
}

function renderOps(data: {
  traffic: {
    totalSinceBoot: number;
    lastMinute: number;
    byStatus: { '2xx': number; '4xx': number; '5xx': number };
    recent: Array<{
      at: string;
      method: string;
      path: string;
      status: number;
      ms: number;
      userId?: string;
    }>;
  };
  queries: {
    lastMinute: number;
    recent: Array<{ at: string; ms: number; sql: string }>;
  };
  tables: Record<string, number>;
  recent: {
    requests: Array<{ code: string; title: string; city: string | null; status: string; createdAt: string }>;
    offers: Array<{ status: string; price: number; currency: string; requestCode: string; createdAt: string }>;
    leads: Array<{ status: string; requestCode: string; requestTitle: string; createdAt: string }>;
    products: Array<{ name: string; city: string | null; isActive: boolean; createdAt: string }>;
    companies: Array<{ name: string; city: string | null; verified: boolean; createdAt: string }>;
    activities: Array<{ type: string; message: string; requestCode: string; createdAt: string }>;
  };
  frontend: {
    base: string;
    checks: Array<{
      path: string;
      ok: boolean;
      status: number;
      ms: number;
      bytes: number;
      title: string | null;
      error?: string;
    }>;
  };
  gemini?: {
    configured: boolean;
    model: string;
    probe: {
      ok: boolean;
      status: number;
      ms: number;
      name?: string | null;
      error?: string;
    };
    calls: {
      totalSinceBoot: number;
      ok: number;
      fail: number;
      lastMinute: number;
      avgMs: number | null;
      recent: Array<{
        at: string;
        purpose: string;
        ok: boolean;
        status: number;
        ms: number;
        promptChars: number;
        responseChars: number;
        promptTokens?: number;
        outputTokens?: number;
        error?: string;
      }>;
    };
  };
}) {
  els.opsLock.style.display = 'none';
  if (els.opsBanner) els.opsBanner.style.display = 'none';
  els.trTotal.textContent = String(data.traffic.totalSinceBoot);
  els.trMin.textContent = String(data.traffic.lastMinute);
  els.trCodes.textContent = `${data.traffic.byStatus['2xx']} / ${data.traffic.byStatus['4xx']} / ${data.traffic.byStatus['5xx']}`;
  els.trSql.textContent = String(data.queries.lastMinute);

  els.trafficBody.innerHTML = data.traffic.recent
    .map(
      (row) => `<tr>
        <td>${fmtTime(row.at)}</td>
        <td>${row.method}</td>
        <td class="sql-cell">${row.path}</td>
        <td>${row.status}</td>
        <td>${row.ms}</td>
        <td>${row.userId ?? '—'}</td>
      </tr>`,
    )
    .join('');

  els.sqlBody.innerHTML = data.queries.recent
    .map(
      (row) => `<tr>
        <td>${fmtTime(row.at)}</td>
        <td>${row.ms}</td>
        <td class="sql-cell">${row.sql}</td>
      </tr>`,
    )
    .join('');

  els.tableCounts.innerHTML = Object.entries(data.tables)
    .map(
      ([name, count]) =>
        `<article class="stat"><small>${name}</small><b>${count}</b></article>`,
    )
    .join('');

  els.dbRequests.innerHTML = feed(
    data.recent.requests.map(
      (r) => `<b>${r.code}</b> ${r.title}<small>${r.status} · ${r.city ?? '—'} · ${fmtTime(r.createdAt)}</small>`,
    ),
  );
  els.dbLeads.innerHTML = feed([
    ...data.recent.offers.map(
      (o) => `<b>${o.requestCode}</b> КП ${o.price} ${o.currency}<small>${o.status} · ${fmtTime(o.createdAt)}</small>`,
    ),
    ...data.recent.leads.map(
      (l) => `<b>${l.requestCode}</b> ${l.requestTitle}<small>lead ${l.status} · ${fmtTime(l.createdAt)}</small>`,
    ),
  ]);
  els.dbCatalog.innerHTML = feed([
    ...data.recent.companies.map(
      (c) => `<b>${c.name}</b><small>${c.city ?? '—'} · ${c.verified ? 'verified' : 'new'} · ${fmtTime(c.createdAt)}</small>`,
    ),
    ...data.recent.products.map(
      (p) => `<b>${p.name}</b><small>${p.city ?? '—'} · ${p.isActive ? 'active' : 'off'} · ${fmtTime(p.createdAt)}</small>`,
    ),
  ]);
  els.dbAct.innerHTML = feed(
    data.recent.activities.map(
      (a) => `<b>${a.type}</b> ${a.message}<small>${a.requestCode} · ${fmtTime(a.createdAt)}</small>`,
    ),
  );

  els.feBase.textContent = data.frontend.base;
  els.frontendBody.innerHTML = data.frontend.checks
    .map(
      (c) => `<tr class="${c.ok ? 'ok' : 'bad'}">
        <td>${c.path}</td>
        <td>${c.ok ? 'OK' : 'FAIL'}</td>
        <td>${c.status}</td>
        <td>${c.ms}</td>
        <td>${c.bytes}</td>
        <td>${c.title ?? '—'}</td>
        <td>${c.error ?? ''}</td>
      </tr>`,
    )
    .join('');

  if (data.gemini) {
    const g = data.gemini;
    els.geConfigured.textContent = g.configured ? 'бар' : 'жоқ';
    els.geModel.textContent = g.model;
    els.geProbe.textContent = g.probe.ok ? 'OK' : 'FAIL';
    els.geProbeMeta.textContent = g.probe.ok
      ? `HTTP ${g.probe.status} · ${g.probe.ms} ms`
      : g.probe.error ?? `HTTP ${g.probe.status}`;
    els.geOkfail.textContent = `${g.calls.ok} / ${g.calls.fail}`;
    els.geTotal.textContent = `boot бері ${g.calls.totalSinceBoot}`;
    els.geAvg.textContent = g.calls.avgMs != null ? `${g.calls.avgMs} ms` : '—';
    els.geMin.textContent = `соңғы 1 мин: ${g.calls.lastMinute}`;
    els.geminiStatus.textContent = g.probe.ok ? 'OK' : g.configured ? 'FAIL' : 'OFF';
    els.geminiDetail.textContent = `${g.model} · ${g.calls.ok}/${g.calls.totalSinceBoot} OK`;
    setStat(
      els.statGemini,
      g.probe.ok ? 'ok' : g.configured ? 'down' : 'warn',
    );
    els.geminiBody.innerHTML = g.calls.recent
      .map(
        (row) => `<tr class="${row.ok ? 'ok' : 'bad'}">
          <td>${fmtTime(row.at)}</td>
          <td>${row.purpose}</td>
          <td>${row.ok ? 'OK' : 'FAIL'}</td>
          <td>${row.status || '—'}</td>
          <td>${row.ms}</td>
          <td>${row.promptChars}</td>
          <td>${row.promptTokens ?? '—'} → ${row.outputTokens ?? '—'}</td>
          <td>${row.error ?? ''}</td>
        </tr>`,
      )
      .join('');
  }
}

function showOpsError(text: string) {
  els.opsLock.style.display = 'block';
  els.opsLock.textContent = text;
  if (els.opsBanner) {
    els.opsBanner.style.display = 'block';
    els.opsBanner.textContent = text;
  }
}

async function fetchOps() {
  const typed = els.secretInput.value.trim();
  if (typed) localStorage.setItem(SECRET_KEY, typed);
  const secret = typed || getSecret();

  const tryUrls: Array<{ url: string; headers?: HeadersInit }> = [
    { url: '/api/snapshot' },
  ];
  if (secret) {
    tryUrls.push({
      url: OPS_URL,
      headers: { 'x-monitor-secret': secret },
    });
  }

  let lastError = secret
    ? 'Дерек жүктелмеді'
    : 'Кілт керек емес — /api/snapshot арқылы ашылады. Бетті жаңартыңыз.';

  for (const item of tryUrls) {
    try {
      const res = await fetch(item.url, {
        cache: 'no-store',
        headers: item.headers,
      });
      if (res.status === 401) {
        lastError = 'MONITOR_SECRET қате';
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = body.includes('502') || body.includes('failed to respond')
          ? 'Render API өшіп тұр (502). Бекенд redeploy керек.'
          : `Ops HTTP ${res.status}`;
        continue;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) {
        lastError = 'Ops JSON емес';
        continue;
      }
      renderOps(await res.json());
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Ops network error';
    }
  }

  showOpsError(lastError);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtUptime(sec?: number) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м ${sec % 60}с`;
}

function setStat(el: HTMLElement, state: 'ok' | 'warn' | 'down') {
  el.dataset.state = state;
}

function uptimePct() {
  if (!history.length) return null;
  const ok = history.filter((h) => h.apiOk && h.dbOk).length;
  return Math.round((ok / history.length) * 100);
}

function overallOk(row: CheckRow) {
  return row.apiOk && row.dbOk && row.frontendOk !== false;
}

function renderCharts() {
  const chronological = [...history].reverse();
  const labels = chronological.map((r) => fmtShort(r.at));

  drawLineChart(
    els.chartLatency,
    [
      {
        label: 'API',
        color: '#2563eb',
        values: chronological.map((r) => r.latencyMs),
      },
      {
        label: 'DB',
        color: '#10a37f',
        values: chronological.map((r) => r.dbLatencyMs),
      },
    ],
    labels,
  );

  drawStatusTimeline(
    els.chartStatus,
    history.map((r) => overallOk(r)),
  );

  const okCount = history.filter((h) => overallOk(h)).length;
  const failCount = history.length - okCount;
  drawDonut(els.chartDonut, okCount, failCount);

  const pct = uptimePct();
  els.donutPct.textContent = pct != null ? `${pct}%` : '—';
  els.legOk.textContent = String(okCount);
  els.legFail.textContent = String(failCount);

  drawBarChart(
    els.chartHistoryBar,
    history.slice(0, 40).map((r) => r.latencyMs ?? 0),
    history.slice(0, 40).map((r) => (overallOk(r) ? '#10a37f' : '#ef4444')),
  );

  const apiLat = history.map((h) => h.latencyMs);
  const dbLat = history.map((h) => h.dbLatencyMs);
  els.statApiAvg.textContent = avg(apiLat) != null ? `${avg(apiLat)} ms` : '—';
  els.statDbAvg.textContent = avg(dbLat) != null ? `${avg(dbLat)} ms` : '—';
  const apiR = minMax(apiLat);
  const dbR = minMax(dbLat);
  els.statApiRange.textContent = apiR ? `${apiR.min} / ${apiR.max} ms` : '—';
  els.statDbRange.textContent = dbR ? `${dbR.min} / ${dbR.max} ms` : '—';
}

function renderHistory() {
  els.historyBody.innerHTML = history
    .map((row) => {
      const allOk = overallOk(row);
      return `<tr class="${allOk ? 'ok' : 'bad'}">
      <td>${fmtTime(row.at)}</td>
      <td>${allOk ? 'OK' : 'FAIL'}</td>
      <td>${row.apiOk ? 'OK' : 'DOWN'}</td>
      <td>${row.dbOk ? 'UP' : 'DOWN'}</td>
      <td>${row.frontendOk == null ? '—' : row.frontendOk ? 'OK' : 'DOWN'}</td>
      <td>${row.latencyMs ?? '—'}</td>
      <td>${row.dbLatencyMs ?? '—'}</td>
      <td>${row.http || '—'}</td>
      <td>${row.error ?? ''}</td>
    </tr>`;
    })
    .join('');
  els.historyCount.textContent = `${history.length} checks`;
}

function renderSummary(row: CheckRow) {
  const allOk = overallOk(row);
  const health = row.health ?? lastHealth;

  els.apiStatus.textContent = row.apiOk ? 'OK' : 'DOWN';
  els.apiDetail.textContent = row.apiOk
    ? `HTTP ${row.http} · ${row.latencyMs ?? '—'} ms`
    : row.error ?? 'No response';

  els.dbStatus.textContent = row.dbOk ? 'UP' : 'DOWN';
  els.dbDetail.textContent = row.dbOk
    ? `SELECT 1 · ${row.dbLatencyMs ?? '—'} ms`
    : 'Connection failed';

  if (row.frontendOk == null) {
    els.frontendStatus.textContent = '—';
    els.frontendDetail.textContent = 'Not configured';
  } else {
    els.frontendStatus.textContent = row.frontendOk ? 'OK' : 'DOWN';
    els.frontendDetail.textContent = FRONTEND_URL.replace(/^https?:\/\//, '');
  }

  const up = uptimePct();
  els.uptimeStatus.textContent = up != null ? `${up}%` : '—';
  els.uptimeDetail.textContent = history.length
    ? `${history.filter((h) => overallOk(h)).length}/${history.length} OK`
    : '—';

  setStat(els.statApi, row.apiOk ? 'ok' : 'down');
  setStat(els.statDb, row.dbOk ? 'ok' : row.apiOk ? 'warn' : 'down');
  setStat(
    els.statFrontend,
    row.frontendOk == null ? 'ok' : row.frontendOk ? 'ok' : 'down',
  );
  setStat(els.statUptime, up != null && up >= 95 ? 'ok' : up != null && up >= 80 ? 'warn' : 'down');

  els.overallBadge.textContent = allOk ? 'All systems OK' : 'Issues detected';
  els.overallBadge.className = allOk ? 'badge green' : 'badge amber';
  els.lastCheck.textContent = fmtTime(row.at);
  els.sideStatus.textContent = allOk ? 'Барлығы OK' : 'Мәселе бар';

  els.infoService.textContent = health?.service ?? 'huphup-backend';
  els.infoTime.textContent = health?.time ? fmtTime(health.time) : '—';
  els.infoUptime.textContent = fmtUptime(health?.uptimeSec);
  els.infoMemory.textContent =
    health?.memoryMb != null ? `${health.memoryMb} MB` : '—';
  els.infoNode.textContent = health?.nodeVersion ?? '—';
  els.infoOverall.textContent = health?.status ?? (allOk ? 'ok' : 'degraded');

  if (row.error) {
    els.lastError.style.display = 'block';
    els.lastError.textContent = row.error;
  } else {
    els.lastError.style.display = 'none';
  }

  renderCharts();
  renderHistory();
}

async function checkFrontend(): Promise<boolean | null> {
  if (!FRONTEND_URL) return null;
  try {
    // no-cors on purpose: a plain static site (Vite dev, plain Vercel
    // hosting) sends no Access-Control-Allow-Origin header, so a `cors`
    // fetch is blocked by the browser before any response is seen — every
    // check would report DOWN regardless of whether the site is actually
    // up. We don't need to read the response, only confirm the host
    // answers: an opaque response means the request reached the server;
    // a thrown error means it didn't (DNS failure, connection refused).
    await fetch(FRONTEND_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

async function runCheck() {
  els.refreshBtn.disabled = true;
  const started = performance.now();
  const row: CheckRow = {
    at: new Date().toISOString(),
    apiOk: false,
    dbOk: false,
    frontendOk: null,
    http: 0,
    latencyMs: null,
    dbLatencyMs: null,
  };

  const [frontendOk] = await Promise.all([
    checkFrontend(),
    (async () => {
      try {
        const res = await fetch(API_URL, { cache: 'no-store' });
        row.http = res.status;
        row.latencyMs = Math.round(performance.now() - started);
        row.apiOk = res.ok;
        if (res.ok) {
          const data = (await res.json()) as HealthPayload;
          row.health = data;
          lastHealth = data;
          row.dbOk = data.database === 'up';
          row.dbLatencyMs =
            typeof data.dbLatencyMs === 'number' ? data.dbLatencyMs : null;
        } else {
          row.error = `API HTTP ${res.status}`;
        }
      } catch (err) {
        row.error = err instanceof Error ? err.message : 'Network error';
      }
    })(),
  ]);

  row.frontendOk = frontendOk;
  if (!row.error && frontendOk === false) {
    row.error = 'Frontend unreachable';
  }

  history.unshift(row);
  if (history.length > MAX_HISTORY) history.pop();

  renderSummary(row);
  await fetchOps();
  els.refreshBtn.disabled = false;
}

function setupMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const menuBtn = document.getElementById('menu-btn');
  const closeBtn = document.getElementById('sidebar-close');

  const setOpen = (open: boolean) => {
    sidebar?.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    if (backdrop) backdrop.hidden = !open;
    menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  menuBtn?.addEventListener('click', () => setOpen(true));
  closeBtn?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  return { close: () => setOpen(false) };
}

function setupTabs() {
  const links = document.querySelectorAll('.nav a[data-tab]');
  const panels = document.querySelectorAll('.tab-panel');
  const crumb = $('crumb-tab');
  const mobileNav = setupMobileNav();

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = (link as HTMLElement).dataset.tab!;
      links.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      panels.forEach((p) => p.classList.remove('is-on'));
      document.getElementById(`tab-${tab}`)?.classList.add('is-on');
      const titles: Record<string, string> = {
        dashboard: 'Dashboard',
        backend: 'Backend',
        database: 'База',
        frontend: 'Frontend',
        gemini: 'Gemini',
        history: 'Тарих',
        endpoints: 'Endpoints',
      };
      crumb.textContent = titles[tab] ?? tab;
      mobileNav.close();
      if (tab === 'dashboard' || tab === 'history') {
        window.requestAnimationFrame(() => renderCharts());
      }
    });
  });
}

function setupEndpoints() {
  els.epApi.textContent = API_URL;
  els.epFrontend.textContent = FRONTEND_URL || '—';
  els.epPoll.textContent = `${POLL_SECONDS} сек`;
  els.epHistory.textContent = String(MAX_HISTORY);
  const swagger = API_URL.replace(/\/api\/v1\/health\/?$/, '/docs');
  els.epSwagger.textContent = swagger;
}

function boot() {
  els.pollLabel.textContent = `Әр ${POLL_SECONDS} сек`;
  els.secretInput.value = getSecret();
  setupTabs();
  setupEndpoints();

  void runCheck();
  timer = window.setInterval(() => void runCheck(), POLL_SECONDS * 1000);
  els.refreshBtn.addEventListener('click', () => void runCheck());
  els.secretSave.addEventListener('click', () => {
    localStorage.setItem(SECRET_KEY, els.secretInput.value.trim());
    void runCheck();
  });
  window.addEventListener('resize', () => renderCharts());
}

boot();

window.addEventListener('beforeunload', () => {
  if (timer) window.clearInterval(timer);
});
