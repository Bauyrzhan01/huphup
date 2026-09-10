#!/usr/bin/env node
/**
 * Скрины воронки (S2–S4). Данные берёт из state.json (нужен прошедший run.mjs).
 *
 * Порядок:
 *   1–7  — фото до решения спора (КП, чат, сделки, балансы);
 *   затем скрипт делает возврат по спорной сделке от имени АДМИНА
 *          (POST /admin/deals/:id/refund — ровно то, что делает кнопка в панели);
 *   8–11 — фото после (админ-панель, балансы, статусы сделок).
 *
 * Скрины в ./screenshots. Требует поднятые фронт :5173, админку :5175, бэк :3000.
 */
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apiJson, login, must, FRONT, ADMIN_FRONT } from '../scenario-lib/huphup-client.mjs';
import { capture } from '../scenario-lib/screenshot-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'screenshots');

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const s = JSON.parse(await readFile(join(HERE, 'state.json'), 'utf8'));

  const buyer = await login(s.buyer.email);
  const winner = await login(s.r1.winnerEmail);
  const admin = await login(s.admin.email);
  const adminUser = JSON.stringify(admin.user);

  const T = { huphup_token: buyer.token };
  const TW = { huphup_token: winner.token };
  const ADMIN_STORAGE = { huphup_admin_token: admin.token };
  const ADMIN_SESSION = { huphup_admin_user: adminUser };

  // ---- до решения спора ------------------------------------------------
  const pre = [
    { name: '01-zakazchik-sravnenie-5-KP-R1', origin: FRONT, storage: T,
      path: `/offers?requestId=${s.r1.requestId}`, note: 'заказчик: 5 КП, лучшее по цене' },
    { name: '02-zakazchik-zayavka-R1', origin: FRONT, storage: T,
      path: `/requests/${s.r1.requestId}`, note: 'заказчик: заявка R1 + предложения' },
    { name: '03-postavshik-krovlyapro-moi-KP', origin: FRONT, storage: TW,
      path: '/supplier/offers', note: 'победитель: его КП принято' },
    { name: '04-zakazchik-chat-R1', origin: FRONT, storage: T,
      path: `/conversations?conversationId=${s.r1.conversationId}`, note: 'чат заказчик ↔ поставщик' },
    { name: '05-zakazchik-sdelki-R1-RELEASED-R2-DISPUTED', origin: FRONT, storage: T,
      path: '/deals', note: 'заказчик: R1 выдана, R2 в споре' },
    { name: '06-zakazchik-balans-do', origin: FRONT, storage: T,
      path: '/balance', note: 'заказчик: кошелёк + движения' },
    { name: '07-postavshik-krovlyapro-balans-kompanii', origin: FRONT, storage: TW,
      path: '/balance', note: 'поставщик: «Баланс» = кошелёк компании, выплата по сделке видна (фикс бага)' },
    { name: '07b-admin-billing-koshelek-kompanii', origin: ADMIN_FRONT, storage: ADMIN_STORAGE, session: ADMIN_SESSION,
      path: '/billing', clickText: s.r1.acceptedCompany, clickWait: 1500,
      note: 'админ-биллинг: тот же кошелёк компании — сверка' },
    { name: '08-admin-spor-DISPUTED', origin: ADMIN_FRONT, storage: ADMIN_STORAGE, session: ADMIN_SESSION,
      path: '/deals', wait: 4200, clickText: s.r2.acceptedCompany, clickWait: 1600,
      note: 'админка: спор по R2 открыт, причина + кнопки выдать/вернуть' },
  ];
  await capture(OUT, pre);

  // ---- решение спора админом (как кнопка «Вернуть покупателю») --------
  console.log('\n  → админ делает возврат по спорной сделке R2…');
  const refund = await apiJson(`/admin/deals/${s.r2.dealId}/refund`, {
    method: 'POST',
    token: admin.token,
    body: { reason: 'Недопоставка и брак подтверждены перепиской в чате. Возврат покупателю.' },
  });
  if (!refund.ok) {
    // уже возвращена прошлым прогоном — не падаем, просто идём дальше
    const cur = await apiJson(`/admin/deals?status=REFUNDED`, { token: admin.token });
    const found = (cur.data || []).find((d) => d.id === s.r2.dealId);
    console.log(`  · возврат уже выполнен ранее (статус ${found?.status ?? '?'})`);
  } else {
    console.log(`  ✓ сделка R2 → ${refund.data.status}`);
  }
  const buyerWallet = must(await apiJson('/billing/wallet', { token: buyer.token }), 'GET /billing/wallet');
  console.log(`  · кошелёк заказчика: ${Number(buyerWallet.balance).toLocaleString('ru')} ₸`);

  // ---- после -----------------------------------------------------------
  const post = [
    { name: '09-admin-vozvrat-sdelan', origin: ADMIN_FRONT, storage: ADMIN_STORAGE, session: ADMIN_SESSION,
      path: '/deals', clickText: ['Возвращены', s.r2.acceptedCompany], wait: 4200,
      note: 'админка: R2 возвращена покупателю' },
    { name: '10-zakazchik-balans-posle-vozvrata', origin: FRONT, storage: T,
      path: '/balance', note: 'заказчик: деньги вернулись' },
    { name: '11-zakazchik-sdelki-posle', origin: FRONT, storage: T,
      path: '/deals', note: 'заказчик: R1 выдана, R2 возвращена' },
  ];
  await capture(OUT, post);

  console.log(`\nГотово. Скрины в ${OUT}`);
}

main().catch((e) => {
  console.error('screenshot.mjs упал:', e.stack || e.message);
  process.exit(1);
});
