#!/usr/bin/env node
/**
 * S14 — комиссия площадки со сделки.
 * Админ включает правило DEAL_COMMISSION = 5% → новая сделка проходит
 * весь цикл → при выплате поставщику удерживается 5%: к выплате = сумма − комиссия.
 * После сценария правило выключается обратно (чтобы не влиять на другие сценарии).
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, setupAcceptedDeal } from '../scenario-lib/flows.mjs';
import { ensureAdmin, topUpUserWallet } from '../scenario-lib/ensure-admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PERCENT = 5;
const BUYER = { email: 'buyer.commission@scenario.huphup.test', person: 'Дана Комиссия' };
const SUP = {
  email: 's.commission@scenario.huphup.test', person: 'Санжар Утеплитель', company: 'ТеплоДом',
  productName: 'Минвата ТЕХНОНИКОЛЬ 100мм', productDesc: 'Минеральная вата 1200×600×100, плотность 35. Упаковка 4 плиты = 2.88 м².',
};

async function setCommission(adminToken, enabled) {
  return must(
    await apiJson('/admin/billing/pricing', {
      method: 'PUT', token: adminToken,
      body: { rules: [{ reason: 'DEAL_COMMISSION', enabled, amount: 0, percent: PERCENT }] },
    }),
    'PUT /admin/billing/pricing',
  );
}
async function supplierBalance(token) {
  return Number(must(await apiJson('/billing/wallet', { token }), 'wallet').balance);
}

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const admin = await ensureAdmin();
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step(`1) Админ включает комиссию ${PERCENT}%`);
  const pricing = await setCommission(admin.token, true);
  const rule = (Array.isArray(pricing) ? pricing : pricing.platform ?? []).find((p) => p.reason === 'DEAL_COMMISSION');
  c.ok(`правило DEAL_COMMISSION: enabled=${rule?.enabled}, percent=${rule?.percent}`);

  {
    c.step('2) Сделка: заявка → КП → акцепт → оплата → отгрузка → подтверждение');
    const price = 1_800_000;
    const deal = await setupAcceptedDeal({
      buyerToken: buyer.token, supplier, price, deliveryDays: 5,
      comment: 'Минвата 100мм, 250 упаковок. Доставка фурой.',
      request: {
        title: 'Минвата 100 мм — 720 м² для утепления склада, Алматы',
        description: 'Требуется минеральная вата 100 мм (1200×600), ~720 м². Алматы. Оплата через сейф-сделку.',
        quantity: '720 м²', deadline: '30.11.2026',
      },
    });
    await topUpUserWallet(admin.token, buyer.user.id, 2_000_000, 'S14: бюджет');
    must(await apiJson(`/deals/${deal.dealId}/pay`, { method: 'POST', token: buyer.token }), 'pay');
    must(await apiJson(`/deals/${deal.dealId}/ship`, { method: 'POST', token: supplier.token }), 'ship');
    const supBefore = await supplierBalance(supplier.token);
    const confirmed = must(await apiJson(`/deals/${deal.dealId}/confirm`, { method: 'POST', token: buyer.token }), 'confirm');
    const supAfter = await supplierBalance(supplier.token);

    const expectedCommission = Math.round(price * PERCENT / 100);
    const expectedPayout = price - expectedCommission;
    c.ok(`сумма ${price.toLocaleString('ru')} · комиссия ${confirmed.commission} · к выплате ${confirmed.payout}`);
    c.ok(`на кошелёк поставщика пришло ${(supAfter - supBefore).toLocaleString('ru')} ₸ (ожидали ${expectedPayout.toLocaleString('ru')})`);

    const checks = [
      ['правило комиссии включилось', rule?.enabled === true],
      [`комиссия = ${PERCENT}% суммы`, Number(confirmed.commission) === expectedCommission],
      ['к выплате = сумма − комиссия', Number(confirmed.payout) === expectedPayout],
      ['поставщик получил именно payout', Math.round(supAfter - supBefore) === expectedPayout],
      ['сделка закрыта (RELEASED)', confirmed.status === 'RELEASED'],
    ];
    c.step('Проверки');
    let failed = 0;
    for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

    await writeFile(join(HERE, 'state.json'), JSON.stringify({
      runAt: new Date().toISOString(),
      admin: admin.email, buyer: BUYER.email, supplierEmail: SUP.email,
      percent: PERCENT, code: deal.code, dealId: deal.dealId,
      amount: price, commission: Number(confirmed.commission), payout: Number(confirmed.payout),
      result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
    }, null, 2));

    console.log('\n' + '─'.repeat(66));
    console.log(failed === 0
      ? `\x1b[1;32mРЕЗУЛЬТАТ: PASS — площадка удержала ${PERCENT}%: поставщику пришло сумма − комиссия.\x1b[0m`
      : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
    if (failed) process.exitCode = 1;
  }
  c.info('правило DEAL_COMMISSION оставлено включённым для скрина; reset.mjs его уберёт');
  console.log(`Админ: ${admin.email} · Заказчик: ${BUYER.email} · пароль ${PASSWORD}`);
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
