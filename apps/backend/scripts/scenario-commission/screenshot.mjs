#!/usr/bin/env node
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { login, FRONT, ADMIN_FRONT } from '../scenario-lib/huphup-client.mjs';
import { capture } from '../scenario-lib/screenshot-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'screenshots');

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const s = JSON.parse(await readFile(join(HERE, 'state.json'), 'utf8'));
  const buyer = await login(s.buyer);
  const sup = await login(s.supplierEmail);
  const admin = await login(s.admin);
  await capture(OUT, [
    { name: '01-zakazchik-sdelka-komissiya', origin: FRONT, storage: { huphup_token: buyer.token },
      path: '/deals', wait: 4200, note: `заказчик: сделка с комиссией площадки ${s.percent}% (${s.commission} ₸)` },
    { name: '02-postavshik-balans-payout', origin: FRONT, storage: { huphup_token: sup.token },
      path: '/balance', wait: 4000, note: `поставщик: пришло ${s.payout} ₸ = сумма − комиссия` },
    { name: '03-admin-pricing', origin: ADMIN_FRONT,
      storage: { huphup_admin_token: admin.token }, session: { huphup_admin_user: JSON.stringify(admin.user) },
      path: '/billing/pricing', wait: 4200, note: 'админ: страница «Цены» — правило DEAL_COMMISSION' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
