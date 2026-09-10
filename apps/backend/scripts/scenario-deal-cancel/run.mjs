#!/usr/bin/env node
/**
 * S13 — отмена сделки до отгрузки.
 * Акцепт КП → сделка → покупатель оплачивает (деньги на удержании) →
 * до отгрузки покупатель отменяет с причиной → деньги возвращаются ему.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, setupAcceptedDeal } from '../scenario-lib/flows.mjs';
import { ensureAdmin, topUpUserWallet } from '../scenario-lib/ensure-admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.cancel@scenario.huphup.test', person: 'Ринат Отмена' };
const SUP = {
  email: 's.cancel@scenario.huphup.test', person: 'Олег Профиль', company: 'ПрофильТорг',
  productName: 'Профиль потолочный 60×27', productDesc: 'Профиль ПП 60×27, оцинковка, 3 м. Для подвесных потолков.',
};

async function balance(token) {
  const w = must(await apiJson('/billing/wallet', { token }), 'GET /billing/wallet');
  return Number(w.balance);
}

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const admin = await ensureAdmin();
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step('1) Заявка → КП → акцепт → сделка');
  const deal = await setupAcceptedDeal({
    buyerToken: buyer.token, supplier, price: 640_000, deliveryDays: 4,
    comment: 'Профиль ПП 60×27, есть на складе',
    request: {
      title: 'Профиль потолочный 60×27 — 400 шт, Алматы',
      description: 'Нужен профиль потолочный ПП 60×27, оцинкованный, 3 м, 400 штук. Алматы, самовывоз.',
      quantity: '400 шт', deadline: '05.11.2026',
    },
  });
  c.ok(`сделка ${deal.dealId.slice(0, 8)}… по ${deal.code} на ${deal.price.toLocaleString('ru')} ₸`);

  c.step('2) Оплата (деньги на удержании площадки)');
  await topUpUserWallet(admin.token, buyer.user.id, 1_000_000, 'S13: бюджет');
  const beforePay = await balance(buyer.token);
  const paid = must(await apiJson(`/deals/${deal.dealId}/pay`, { method: 'POST', token: buyer.token }), 'pay');
  const afterPay = await balance(buyer.token);
  c.ok(`статус ${paid.status} · кошелёк ${beforePay.toLocaleString('ru')} → ${afterPay.toLocaleString('ru')} ₸ (списано ${deal.price.toLocaleString('ru')})`);

  c.step('3) Покупатель отменяет до отгрузки');
  const REASON = 'Поменялись сроки объекта, профиль больше не нужен. Отменяю до отгрузки.';
  const cancelled = must(
    await apiJson(`/deals/${deal.dealId}/cancel`, { method: 'POST', token: buyer.token, body: { reason: REASON } }),
    'cancel',
  );
  const after = await balance(buyer.token);
  c.ok(`статус ${cancelled.status} · кошелёк заказчика ${afterPay.toLocaleString('ru')} → ${after.toLocaleString('ru')} ₸`);

  const checks = [
    ['оплата перевела сделку в HELD', paid.status === 'HELD'],
    ['оплата списала сумму сделки', Math.round(beforePay - afterPay) === deal.price],
    ['отмена → REFUNDED', cancelled.status === 'REFUNDED'],
    ['деньги вернулись покупателю', Math.round(after - afterPay) === deal.price && Math.round(after) === Math.round(beforePay)],
    ['причина сохранена', (cancelled.disputeReason || '').startsWith('Поменялись')],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, supplierEmail: SUP.email,
    code: deal.code, dealId: deal.dealId, dealStatus: cancelled.status,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — сделку отменили до отгрузки, деньги вернулись покупателю.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} / ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
