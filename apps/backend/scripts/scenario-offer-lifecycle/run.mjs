#!/usr/bin/env node
/**
 * S11 — жизненный цикл КП: отклонение и отзыв.
 * 3 поставщика шлют КП по одной заявке → заказчик ОТКЛОНЯЕТ одно →
 * второй поставщик сам ОТЗЫВАЕТ своё → остаётся одно → заказчик его принимает.
 * Проверяем статусы PENDING/REJECTED/WITHDRAWN/ACCEPTED и что после акцепта
 * прочие PENDING (если бы были) закрылись, а заявка ушла в IN_PROGRESS.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, publishRequest, sendOffer, acceptOffer } from '../scenario-lib/flows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.offers@scenario.huphup.test', person: 'Аида Выбор' };
const PRODUCT = 'Пеноблок D500 600×300×200';
const SUPS = [
  { key: 'accept', email: 's1.offers@scenario.huphup.test', person: 'Мурат Блок', company: 'БлокМаркет',
    offer: { price: 1_150_000, deliveryDays: 5, comment: 'D500, поддон 1.8 м³. Со склада, манипулятор наш.' } },
  { key: 'reject', email: 's2.offers@scenario.huphup.test', person: 'Данияр Газоблок', company: 'ГазоблокKZ',
    offer: { price: 1_420_000, deliveryDays: 3, comment: 'D500 премиум, идеальная геометрия. Дороже, но быстро.' } },
  { key: 'withdraw', email: 's3.offers@scenario.huphup.test', person: 'Ерлан Ячейка', company: 'ЯчеистыйБетон',
    offer: { price: 1_260_000, deliveryDays: 7, comment: 'D500, отгрузка через неделю — сейчас нет машины.' } },
];

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');

  c.step('1) 3 поставщика + заявка');
  const suppliers = {};
  for (const s of SUPS) {
    suppliers[s.key] = await ensureSupplierWithProduct({
      email: s.email, person: s.person, company: s.company,
      productName: PRODUCT, productDesc: `Пеноблок ${PRODUCT}, автоклавный, D500. Кладка стен и перегородок.`,
      unit: 'м³',
    });
  }
  const req = await publishRequest(buyer.token, {
    title: 'Пеноблок D500 600×300×200 — 90 м³ для коттеджа, Алматы',
    description: 'Требуется пеноблок автоклавный D500, 600×300×200, ~90 м³. Алматы, самовывоз или доставка. Оплата через сейф-сделку.',
    quantity: '90 м³', deadline: '10.12.2026',
  });
  c.ok(`заявка ${req.code} · подобрано поставщиков: ${req.leadsCreated}`);

  c.step('2) 3 КП');
  const offers = {};
  for (const s of SUPS) {
    offers[s.key] = await sendOffer(suppliers[s.key].token, req.id, s.offer);
    c.info(`${s.company}: ${s.offer.price.toLocaleString('ru')} ₸ / ${s.offer.deliveryDays} дн.`);
  }

  c.step('3) Заказчик отклоняет одно КП');
  const rejected = must(await apiJson(`/offers/${offers.reject.id}/reject`, { method: 'POST', token: buyer.token }), 'reject');
  c.ok(`${SUPS[1].company}: КП → ${rejected.status}`);

  c.step('4) Другой поставщик сам отзывает КП');
  const withdrawn = must(await apiJson(`/offers/${offers.withdraw.id}/withdraw`, { method: 'POST', token: suppliers.withdraw.token }), 'withdraw');
  c.ok(`${SUPS[2].company}: КП → ${withdrawn.status}`);

  c.step('5) Заказчик принимает оставшееся КП');
  const accepted = await acceptOffer(buyer.token, offers.accept.id);
  c.ok(`${SUPS[0].company}: КП принято → чат ${accepted.conversationId.slice(0, 8)}…, сделка ${accepted.dealId.slice(0, 8)}…`);

  const finalOffers = must(await apiJson(`/offers/by-request/${req.id}`, { token: buyer.token }), 'by-request');
  const byCompany = Object.fromEntries(finalOffers.map((o) => [o.company.name, o.status]));
  const reqFinal = must(await apiJson(`/requests/${req.id}`, { token: buyer.token }), 'request');

  const checks = [
    ['отклонённое КП = REJECTED', byCompany[SUPS[1].company] === 'REJECTED'],
    ['отозванное КП = WITHDRAWN', byCompany[SUPS[2].company] === 'WITHDRAWN'],
    ['принятое КП = ACCEPTED', byCompany[SUPS[0].company] === 'ACCEPTED'],
    ['заявка перешла в IN_PROGRESS', reqFinal.status === 'IN_PROGRESS'],
    ['по заявке ровно 1 активное (accepted) КП', finalOffers.filter((o) => o.status === 'ACCEPTED').length === 1],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email,
    suppliers: SUPS.map((s) => ({ company: s.company, email: s.email, key: s.key })),
    requestId: req.id, code: req.code,
    statuses: byCompany, requestStatus: reqFinal.status,
    acceptSupplierEmail: SUPS[0].email,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — отклонение, отзыв и акцепт КП отрабатывают корректно.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} / ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
