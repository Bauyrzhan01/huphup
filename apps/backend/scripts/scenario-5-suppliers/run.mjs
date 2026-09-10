#!/usr/bin/env node
/**
 * Сценарий: 1 заказчик -> заявка с PDF -> 5 поставщиков одного товара -> заявка
 * падает всем 5 во «Входящие» (leads).
 *
 * Что делает скрипт (всё через реальный HTTP API бэкенда):
 *   1. Регистрирует/логинит заказчика (BUYER).
 *   2. Регистрирует/логинит 5 поставщиков (SUPPLIER), каждому создаёт компанию и
 *      один и тот же товар «Профнастил С8» — с разным описанием, ценой и фото.
 *   3. Заказчик создаёт заявку, прикладывает PDF-спецификацию, публикует её.
 *      На публикации бэкенд подбирает поставщиков (Gemini или, без ключа,
 *      keyword-матчинг) и заводит lead каждому.
 *   4. Логинится каждым поставщиком и печатает его «Входящие» (GET /leads).
 *
 * Требует поднятый бэкенд на API_BASE и сгенерированные ассеты
 * (`python generate-assets.py`).
 *
 * Запуск:  node run.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, 'assets');
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'ScenarioPass123!';
const RUN_TAG = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');

const CITY = 'Алматы';

// Общий товар. Описания у поставщиков разные, но с общими ключевыми словами,
// чтобы под заявку подошли все пятеро.
const PRODUCT_NAME = 'Профнастил С8';
const SUPPLIERS = [
  {
    key: 'stroymetall',
    email: 's1.stroymetall@scenario.huphup.test',
    person: 'Арман Досжанов',
    company: 'СтройМеталл Алматы',
    productDesc:
      'Профнастил С8 оцинкованный, стеновой профилированный лист для кровли и стен. ' +
      'Цвет RAL 9003 сигнально-белый, толщина стали 0.45 мм, покрытие полиэстер глянцевый. ' +
      'Профлист со склада в Алматы, длина листа под заказ, есть остатки под быструю отгрузку.',
    price: '2 900 ₸/лист',
    photo: 'supplier-stroymetall-photo.png',
  },
  {
    key: 'krovlyapro',
    email: 's2.krovlyapro@scenario.huphup.test',
    person: 'Динара Ныгметова',
    company: 'КровляПро KZ',
    productDesc:
      'Профнастил С8 оцинкованный без покрытия, стеновой профилированный лист для кровли, ' +
      'заборов и навесов. Толщина стали 0.50 мм, цинк Zn140. Режем профлист в размер, ' +
      'склад в Алматы.',
    price: '2 400 ₸/лист',
    photo: 'supplier-krovlyapro-photo.png',
  },
  {
    key: 'metallprofil',
    email: 's3.metallprofil@scenario.huphup.test',
    person: 'Ерлан Сапаров',
    company: 'МеталлПрофиль Астана-Юг',
    productDesc:
      'Профнастил С8, стеновой профилированный лист, оцинкованный с полимерным покрытием. ' +
      'Цвет RAL 8017 шоколадно-коричневый, толщина 0.50 мм, полиэстер матовый. ' +
      'Профлист для кровли склада, гарантия на цинк 10 лет, склад в Алматы.',
    price: '3 150 ₸/лист',
    photo: 'supplier-metallprofil-photo.png',
  },
  {
    key: 'grandsteel',
    email: 's4.grandsteel@scenario.huphup.test',
    person: 'Тимур Ахметов',
    company: 'Grand Steel',
    productDesc:
      'Профнастил С8 оцинкованный, эконом-профлист. Цвет RAL 6005 зелёный мох, ' +
      'толщина стали 0.40 мм, покрытие полиэстер. Стеновой профилированный лист, ' +
      'подходит для навесов и кровли складского ангара. Отгрузка со склада в Алматы.',
    price: '2 750 ₸/лист',
    photo: 'supplier-grandsteel-photo.png',
  },
  {
    key: 'aktorgmetall',
    email: 's5.aktorgmetall@scenario.huphup.test',
    person: 'Сауле Ким',
    company: 'АкТоргМеталл',
    productDesc:
      'Профнастил С8 усиленный, оцинкованный, стеновой профилированный лист. ' +
      'Цвет RAL 5005 сигнально-синий, толщина стали 0.55 мм, покрытие полиэстер. ' +
      'Длина листа профлиста до 6 м под заказ, склад и самовывоз в Алматы.',
    price: '3 400 ₸/лист',
    photo: 'supplier-aktorgmetall-photo.png',
  },
];

const BUYER = {
  email: 'buyer.profnastil@scenario.huphup.test',
  person: 'Мади Оспанов',
};

const REQUEST = {
  title: `Профнастил С8 оцинкованный — 800 листов для кровли склада, ${CITY}`,
  description:
    'Требуется профнастил С8 оцинкованный, стеновой профилированный лист, для кровли ' +
    'складского ангара. Количество 800 листов, длина листа 2000 мм, толщина стали ' +
    '0.45–0.55 мм, оцинковка горячая. Город Алматы, самовывоз со склада поставщика, ' +
    'оплата по счёту (безнал). Рассматриваем профлист С8 любого цвета RAL и ' +
    'оцинкованный без покрытия. Срок — до 30 сентября 2026.',
  category: 'Стройматериалы',
  city: CITY,
  quantity: '800 листов',
  deadline: '30.09.2026',
};

// ---------------------------------------------------------------------------

let FAILURES = 0;
const log = (...a) => console.log(...a);
const ok = (m) => log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => log(`  \x1b[36m·\x1b[0m ${m}`);
const warn = (m) => {
  FAILURES++;
  log(`  \x1b[31m✗ ${m}\x1b[0m`);
};

async function apiJson(path, { method = 'GET', token, body } = {}) {
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

async function apiUpload(path, token, filePath, filename) {
  const buf = await readFile(filePath);
  const fd = new FormData();
  const type = filename.endsWith('.pdf') ? 'application/pdf' : 'image/png';
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

async function registerOrLogin(email, fullName, role) {
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
    if (login.ok) return { token: login.data.accessToken, user: login.data.user, fresh: false };
    throw new Error(`login failed for ${email}: ${login.status} ${JSON.stringify(login.data)}`);
  }
  throw new Error(`register failed for ${email}: ${reg.status} ${JSON.stringify(reg.data)}`);
}

async function ensureCompany(token, dto) {
  const created = await apiJson('/companies', { method: 'POST', token, body: dto });
  if (created.ok) return { company: created.data, fresh: true };
  if (created.status === 409) {
    const mine = await apiJson('/companies/me', { token });
    if (mine.ok) return { company: mine.data, fresh: false };
  }
  throw new Error(`company failed: ${created.status} ${JSON.stringify(created.data)}`);
}

async function ensureProduct(token, dto) {
  const mine = await apiJson('/products/mine', { token });
  if (mine.ok && Array.isArray(mine.data)) {
    const found = mine.data.find((p) => p.name === dto.name);
    if (found) return { product: found, fresh: false };
  }
  const created = await apiJson('/products', { method: 'POST', token, body: dto });
  if (created.ok) return { product: created.data, fresh: true };
  throw new Error(`product failed: ${created.status} ${JSON.stringify(created.data)}`);
}

// ---------------------------------------------------------------------------

async function main() {
  log('\n\x1b[1mСценарий: 1 заказчик · заявка с PDF · 5 поставщиков «Профнастил С8»\x1b[0m');
  log(`API: ${API_BASE}\n`);

  // health
  const health = await apiJson('/health/live');
  if (!health.ok) throw new Error(`бэкенд недоступен на ${API_BASE} (health ${health.status})`);
  ok(`бэкенд доступен (uptime ${health.data.uptimeSec}s)`);

  // --- поставщики ---------------------------------------------------------
  log('\n\x1b[1m1) Поставщики\x1b[0m');
  const suppliers = [];
  for (const s of SUPPLIERS) {
    const { token, user } = await registerOrLogin(s.email, s.person, 'SUPPLIER');
    const { company } = await ensureCompany(token, {
      name: s.company,
      city: CITY,
      description: `${s.company} — металлопрокат, профнастил, кровельные материалы. г. ${CITY}.`,
      categories: ['Стройматериалы'],
    });
    const { product, fresh: productFresh } = await ensureProduct(token, {
      name: PRODUCT_NAME,
      description: s.productDesc,
      unit: 'лист',
      city: CITY,
    });

    // фото товара
    let imageStatus = 'уже есть';
    const hasImages = Array.isArray(product.images) && product.images.length > 0;
    if (!hasImages) {
      const up = await apiUpload(
        `/products/${product.id}/images`,
        token,
        join(ASSETS, s.photo),
        s.photo,
      );
      imageStatus = up.ok ? 'загружено' : `ОШИБКА ${up.status}`;
      if (!up.ok) warn(`${s.company}: фото не загрузилось: ${JSON.stringify(up.data)}`);
    }

    ok(
      `${s.company}  ·  товар «${product.name}» (${productFresh ? 'создан' : 'существует'})  ·  фото: ${imageStatus}`,
    );
    info(`    ${s.productDesc.slice(0, 96)}…`);
    suppliers.push({ ...s, token, userId: user.id, companyId: company.id, productId: product.id });
  }

  // --- заказчик + заявка -------------------------------------------------
  log('\n\x1b[1m2) Заказчик и заявка\x1b[0m');
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  ok(`заказчик ${BUYER.email}`);

  const created = await apiJson('/requests', {
    method: 'POST',
    token: buyer.token,
    body: {
      ...REQUEST,
      rawText: REQUEST.description,
    },
  });
  if (!created.ok) throw new Error(`создание заявки: ${created.status} ${JSON.stringify(created.data)}`);
  const requestId = created.data.id;
  ok(`заявка создана: ${created.data.code} (черновик)`);

  const pdf = 'buyer-request-profnastil.pdf';
  const att = await apiUpload(
    `/requests/${requestId}/attachments`,
    buyer.token,
    join(ASSETS, pdf),
    pdf,
  );
  if (att.ok) ok(`PDF-спецификация прикреплена: ${pdf}`);
  else warn(`PDF не прикрепился: ${att.status} ${JSON.stringify(att.data)}`);

  const published = await apiJson(`/requests/${requestId}/publish`, {
    method: 'POST',
    token: buyer.token,
  });
  if (!published.ok) throw new Error(`публикация: ${published.status} ${JSON.stringify(published.data)}`);
  const matched = published.data.matchedSuppliers || [];
  ok(`заявка опубликована · подобрано поставщиков: ${published.data.leadsCreated}`);
  for (const m of matched) {
    info(`    ${m.companyName}  score=${Math.round(m.score)}  ${m.reason || ''}`);
  }

  // --- входящие каждого поставщика -------------------------------------
  log('\n\x1b[1m3) Входящие поставщиков (GET /leads)\x1b[0m');
  const inbox = [];
  for (const s of suppliers) {
    const leadsRes = await apiJson('/leads', { token: s.token });
    if (!leadsRes.ok) {
      warn(`${s.company}: /leads вернул ${leadsRes.status}`);
      continue;
    }
    const leads = leadsRes.data || [];
    const forThis = leads.find((l) => l.request?.id === requestId || l.requestId === requestId);
    const rec = {
      company: s.company,
      email: s.email,
      leadsTotal: leads.length,
      gotThisRequest: Boolean(forThis),
      lead: forThis
        ? {
            id: forThis.id,
            code: forThis.request?.code,
            title: forThis.request?.title,
            status: forThis.status,
            score: Math.round(forThis.score),
            matchReason: forThis.matchReason,
            matchedProduct: forThis.matchedProduct?.name,
          }
        : null,
    };
    inbox.push(rec);
    if (forThis) {
      ok(
        `${s.company}: получил заявку ${forThis.request?.code}  ·  статус ${forThis.status}  ·  score ${Math.round(forThis.score)}  ·  «${forThis.matchReason || '—'}»`,
      );
    } else {
      warn(`${s.company}: заявка НЕ пришла (во входящих ${leads.length} шт.)`);
    }
  }

  const gotAll = inbox.length === 5 && inbox.every((r) => r.gotThisRequest);
  const summary = {
    runAt: new Date().toISOString(),
    api: API_BASE,
    geminiConfigured: false,
    request: { id: requestId, code: created.data.code, title: REQUEST.title },
    buyer: BUYER.email,
    suppliers: suppliers.map((s) => ({
      company: s.company,
      email: s.email,
      companyId: s.companyId,
      productId: s.productId,
      leadsUrl: '/supplier/leads',
    })),
    matchedSuppliers: matched,
    inbox,
    result: gotAll ? 'PASS — заявка пришла всем 5 поставщикам' : 'FAIL',
    failures: FAILURES,
  };
  await writeFile(join(ASSETS, 'last-run.json'), JSON.stringify(summary, null, 2));

  log('\n' + '─'.repeat(70));
  if (gotAll && FAILURES === 0) {
    log('\x1b[1;32mРЕЗУЛЬТАТ: PASS — одна заявка с PDF пришла во «Входящие» всем 5 поставщикам.\x1b[0m');
  } else {
    log(`\x1b[1;31mРЕЗУЛЬТАТ: FAIL — see assets/last-run.json (failures=${FAILURES})\x1b[0m`);
    process.exitCode = 1;
  }
  log('Логины для скринов (пароль у всех: ' + PASSWORD + '):');
  log(`  заказчик:   ${BUYER.email}`);
  for (const s of SUPPLIERS) log(`  поставщик:  ${s.email}   (${s.company})`);
  log('assets/last-run.json — полный отчёт.');
}

main().catch((e) => {
  console.error('\n\x1b[1;31mСценарий упал:\x1b[0m', e.message);
  process.exit(1);
});
