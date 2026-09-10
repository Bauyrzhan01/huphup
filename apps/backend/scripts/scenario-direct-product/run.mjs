#!/usr/bin/env node
/**
 * S5 — прямой запрос по товару.
 *
 * Заказчик открывает карточку конкретного товара поставщика в каталоге и шлёт
 * запрос напрямую (не публичную заявку по всему рынку). Лид уходит ТОЛЬКО
 * этому поставщику, со score 100 и пометкой прямого запроса.
 *
 * Требует поднятый бэкенд и уже существующие товары «Профнастил С8» у
 * поставщиков (их создаёт любой из предыдущих сценариев; при необходимости
 * скрипт создаст их сам).
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  API_BASE, PASSWORD, c,
  apiJson, must, health, registerOrLogin, ensureCompany, ensureProduct,
} from '../scenario-lib/huphup-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CITY = 'Алматы';
const PRODUCT_NAME = 'Профнастил С8';

const TARGET = { key: 'grandsteel', email: 's4.grandsteel@scenario.huphup.test', person: 'Тимур Ахметов', company: 'Grand Steel',
  desc: 'Профнастил С8 оцинкованный, эконом-профлист. RAL 6005 зелёный, 0.40 мм, полиэстер. Стеновой профилированный лист. Склад в Алматы.' };
const OTHER = { key: 'krovlyapro', email: 's2.krovlyapro@scenario.huphup.test', person: 'Динара Ныгметова', company: 'КровляПро KZ',
  desc: 'Профнастил С8 оцинкованный без покрытия, 0.50 мм. Режем в размер. Склад в Алматы.' };
const BUYER = { email: 'buyer.profnastil@scenario.huphup.test', person: 'Мади Оспанов' };

async function ensureSupplierProduct(s) {
  const { token } = await registerOrLogin(s.email, s.person, 'SUPPLIER');
  await ensureCompany(token, {
    name: s.company, city: CITY,
    description: `${s.company} — металлопрокат, профнастил. г. ${CITY}.`,
    categories: ['Стройматериалы'],
  });
  const { product } = await ensureProduct(token, { name: PRODUCT_NAME, description: s.desc, unit: 'лист', city: CITY });
  return { token, product };
}

async function main() {
  const h = await health();
  c.ok(`бэкенд доступен (uptime ${h.uptimeSec}s), API ${API_BASE}`);

  c.step('1) Поставщики и товар');
  const target = await ensureSupplierProduct(TARGET);
  const other = await ensureSupplierProduct(OTHER);
  c.ok(`${TARGET.company}: товар «${target.product.name}» (${target.product.id.slice(0, 8)}…)`);
  c.ok(`${OTHER.company}: товар «${other.product.name}» (для контроля — ему lead прийти НЕ должен)`);

  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');

  c.step('2) Заказчик находит товар в каталоге и шлёт прямой запрос');
  const catalog = must(
    await apiJson(`/products/catalog?q=${encodeURIComponent('Профнастил')}&limit=50`),
    'GET /products/catalog?q=',
  );
  const inCatalog = (catalog.items || []).find((p) => p.id === target.product.id) || null;
  c.ok(`товар найден в публичном каталоге по запросу «Профнастил»: ${inCatalog ? 'да' : 'НЕТ'} (найдено: ${catalog.items?.length ?? 0})`);

  const direct = must(
    await apiJson('/requests/direct', {
      method: 'POST', token: buyer.token,
      body: { productId: target.product.id, quantity: '400 листов', deadline: '20.12.2026' },
    }),
    'POST /requests/direct',
  );
  const reqFull = must(await apiJson(`/requests/${direct.request.id}`, { token: buyer.token }), 'GET /requests/:id');
  c.ok(`прямой запрос создан и опубликован: ${direct.request.code} · товар «${target.product.name}»`);

  c.step('3) Проверка адресности лида');
  const targetLeads = must(await apiJson('/leads', { token: target.token }), 'GET /leads (target)');
  const otherLeads = must(await apiJson('/leads', { token: other.token }), 'GET /leads (other)');
  const targetLead = targetLeads.find((l) => (l.request?.id || l.requestId) === direct.request.id);
  const otherGot = otherLeads.some((l) => (l.request?.id || l.requestId) === direct.request.id);

  if (targetLead) {
    c.ok(`${TARGET.company}: получил лид ${targetLead.request?.code} · score ${Math.round(targetLead.score)} · «${targetLead.matchReason}» · товар: ${targetLead.matchedProduct?.name}`);
  } else {
    c.fail(`${TARGET.company}: лид НЕ пришёл`);
  }
  (otherGot ? c.fail : c.ok)(
    otherGot
      ? `${OTHER.company}: ОШИБКА — получил лид по чужому прямому запросу`
      : `${OTHER.company}: лид не пришёл (правильно — прямой запрос адресный)`,
  );

  const checks = [
    ['товар в публичном каталоге', Boolean(inCatalog)],
    ['целевой поставщик получил лид', Boolean(targetLead)],
    ['score прямого лида = 100', targetLead?.score === 100],
    ['лид связан с товаром', targetLead?.matchedProduct?.id === target.product.id],
    ['другой поставщик лид НЕ получил', !otherGot],
    ['заявка = 1 лид (адресная)', (reqFull.leads?.length ?? 0) === 1],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [name, pass] of checks) (pass ? c.ok : (m) => { failed++; c.fail(m); })(name);

  const state = {
    runAt: new Date().toISOString(),
    api: API_BASE,
    buyer: BUYER.email,
    target: { company: TARGET.company, email: TARGET.email, productId: target.product.id },
    other: { company: OTHER.company, email: OTHER.email },
    request: { id: direct.request.id, code: direct.request.code },
    targetLeadId: targetLead?.id ?? null,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  };
  await writeFile(join(HERE, 'state.json'), JSON.stringify(state, null, 2));

  console.log('\n' + '─'.repeat(70));
  console.log(
    failed === 0
      ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — прямой запрос по товару ушёл адресно одному поставщику (score 100).\x1b[0m'
      : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed}) — см. state.json\x1b[0m`,
  );
  console.log('Логины (пароль ' + PASSWORD + '):');
  console.log(`  заказчик:  ${BUYER.email}`);
  console.log(`  поставщик: ${TARGET.email} (${TARGET.company})`);
  console.log(`  карточка товара: /products/${target.product.id}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error('\n\x1b[1;31mСценарий упал:\x1b[0m', e.stack || e.message);
  process.exit(1);
});
