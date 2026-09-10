#!/usr/bin/env node
/**
 * S15 — оплата сделки при нехватке денег.
 * Акцепт → сделка → у покупателя пустой кошелёк → POST /deals/:id/pay → 402,
 * сделка остаётся AWAITING_PAYMENT, деньги никуда не двинулись →
 * админ пополняет кошелёк → повторная оплата проходит → HELD.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, setupAcceptedDeal } from '../scenario-lib/flows.mjs';
import { ensureAdmin, topUpUserWallet } from '../scenario-lib/ensure-admin.mjs';
import { zeroWallet, disconnect } from '../scenario-lib/db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.nofunds@scenario.huphup.test', person: 'Тимур Безбюджета' };
const SUP = {
  email: 's.nofunds@scenario.huphup.test', person: 'Ержан Кирпич', company: 'КирпичДвор',
  productName: 'Кирпич керамический М150', productDesc: 'Кирпич рядовой полнотелый М150, 250×120×65. Поддон 480 шт.',
};

async function balance(token) {
  const w = must(await apiJson('/billing/wallet', { token }), 'GET /billing/wallet');
  return Number(w.balance);
}
async function dealStatus(token, id) {
  return (must(await apiJson('/deals', { token }), 'GET /deals').find((d) => d.id === id) || {}).status;
}

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const admin = await ensureAdmin();
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step('1) Заявка → КП → акцепт → сделка');
  const deal = await setupAcceptedDeal({
    buyerToken: buyer.token, supplier, price: 2_400_000, deliveryDays: 7,
    comment: 'Кирпич М150, 20 поддонов. Манипулятор наш.',
    request: {
      title: 'Кирпич керамический М150 — 20 поддонов, Алматы',
      description: 'Нужен кирпич рядовой полнотелый М150, 250×120×65, ~9600 штук (20 поддонов). Алматы. Оплата через сейф-сделку.',
      quantity: '20 поддонов', deadline: '25.11.2026',
    },
  });
  await zeroWallet({ userId: buyer.user.id });
  c.ok(`сделка ${deal.code} на ${deal.price.toLocaleString('ru')} ₸ · кошелёк заказчика обнулён (${await balance(buyer.token)} ₸)`);

  c.step('2) Оплата без денег → 402');
  const fail = await apiJson(`/deals/${deal.dealId}/pay`, { method: 'POST', token: buyer.token });
  const statusAfterFail = await dealStatus(buyer.token, deal.dealId);
  c.ok(`POST /deals/:id/pay → HTTP ${fail.status} («${fail.data?.message ?? ''}») · сделка осталась ${statusAfterFail}`);

  c.step('3) Админ пополняет кошелёк → повторная оплата проходит');
  const topup = await topUpUserWallet(admin.token, buyer.user.id, 2_500_000, 'S15: оплата по счёту №77');
  c.ok(`кошелёк заказчика: 0 → ${Number(topup.balance).toLocaleString('ru')} ₸`);
  const paid = must(await apiJson(`/deals/${deal.dealId}/pay`, { method: 'POST', token: buyer.token }), 'pay#2');
  c.ok(`повторная оплата → статус ${paid.status}, на кошельке ${(await balance(buyer.token)).toLocaleString('ru')} ₸`);

  const checks = [
    ['без денег оплата отбита 402', fail.status === 402],
    ['после отказа сделка всё ещё ждёт оплату', statusAfterFail === 'AWAITING_PAYMENT'],
    ['баланс не ушёл в минус', (await balance(buyer.token)) >= 0],
    ['после пополнения оплата прошла → HELD', paid.status === 'HELD'],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, code: deal.code, dealId: deal.dealId,
    firstPayHttp: fail.status, finalStatus: paid.status,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — оплата без денег = 402 без движения средств; после пополнения проходит.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} / ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exitCode = 1; })
  .finally(disconnect);
