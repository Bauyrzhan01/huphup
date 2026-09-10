#!/usr/bin/env node
/**
 * S12 — автовыпуск денег через 7 дней после отгрузки.
 * Акцепт → сделка → оплата → отгрузка (пошёл срок автовыпуска) →
 * срок «наступает» (переводим autoReleaseAt в прошлое) → любой GET /deals
 * лениво выпускает деньги поставщику со статусом RELEASED и комментарием
 * «Автовыпуск через 7 дней после отгрузки».
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, setupAcceptedDeal } from '../scenario-lib/flows.mjs';
import { ensureAdmin, topUpUserWallet } from '../scenario-lib/ensure-admin.mjs';
import { backdateDealAutoRelease, disconnect } from '../scenario-lib/db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.autorelease@scenario.huphup.test', person: 'Асель Молчание' };
const SUP = {
  email: 's.autorelease@scenario.huphup.test', person: 'Кайрат Кровля', company: 'КровляСнаб',
  productName: 'Ондулин классик', productDesc: 'Ондулин лист 2000×950, 8 волн. Кровельный битумный лист, гарантия 15 лет.',
};

async function supplierBalance(token) {
  const w = must(await apiJson('/billing/wallet', { token }), 'GET /billing/wallet');
  return Number(w.balance);
}

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const admin = await ensureAdmin();
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step('1) Заявка → КП → акцепт → оплата → отгрузка');
  const deal = await setupAcceptedDeal({
    buyerToken: buyer.token, supplier, price: 1_120_000, deliveryDays: 6,
    comment: 'Ондулин классик, красный. Со склада, доставка по городу.',
    request: {
      title: 'Ондулин классик — 700 листов для дачного посёлка, Алматы',
      description: 'Требуется ондулин классик (битумный кровельный лист) 2000×950, 700 листов. Алматы. Оплата через сейф-сделку.',
      quantity: '700 листов', deadline: '20.11.2026',
    },
  });
  await topUpUserWallet(admin.token, buyer.user.id, 1_500_000, 'S12: бюджет');
  must(await apiJson(`/deals/${deal.dealId}/pay`, { method: 'POST', token: buyer.token }), 'pay');
  const shipped = must(await apiJson(`/deals/${deal.dealId}/ship`, { method: 'POST', token: supplier.token }), 'ship');
  c.ok(`оплачено и отгружено → ${shipped.status}, автовыпуск назначен на ${new Date(shipped.autoReleaseAt).toLocaleDateString('ru')}`);

  const supBefore = await supplierBalance(supplier.token);

  c.step('2) Проходит 7 дней (переводим срок автовыпуска в прошлое)');
  await backdateDealAutoRelease(deal.dealId, 1);
  c.ok('autoReleaseAt < now — сделка «просрочена»');

  c.step('3) Заказчик открывает «Сделки» → ленивый автовыпуск');
  const list = must(await apiJson('/deals', { token: buyer.token }), 'GET /deals');
  const d = list.find((x) => x.id === deal.dealId);
  const supAfter = await supplierBalance(supplier.token);
  c.ok(`статус ${d.status} · на кошельке «${supplier.company}» ${supBefore.toLocaleString('ru')} → ${supAfter.toLocaleString('ru')} ₸`);

  const txs = must(await apiJson('/billing/transactions', { token: supplier.token }), 'GET /billing/transactions');
  const releaseTx = (txs.items || []).find((t) => t.reason === 'ESCROW_RELEASE');
  c.ok(`проводка поставщика: «${releaseTx?.comment ?? '—'}»`);

  const checks = [
    ['после отгрузки статус SHIPPED', shipped.status === 'SHIPPED'],
    ['после срока автовыпуска → RELEASED', d.status === 'RELEASED'],
    ['деньги ушли поставщику', supAfter - supBefore === deal.price],
    ['комментарий про автовыпуск', /автовыпуск/i.test(releaseTx?.comment ?? '')],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, supplierEmail: SUP.email,
    code: deal.code, dealId: deal.dealId, dealStatus: d.status,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — молчание покупателя 7 дней → деньги ушли поставщику автоматически.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} · Поставщик: ${SUP.email} · пароль ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exitCode = 1; })
  .finally(disconnect);
