#!/usr/bin/env node
/** Скрины S5 (прямой запрос по товару). Данные из state.json. */
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { login, FRONT } from '../scenario-lib/huphup-client.mjs';
import { capture } from '../scenario-lib/screenshot-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'screenshots');

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const s = JSON.parse(await readFile(join(HERE, 'state.json'), 'utf8'));
  const buyer = await login(s.buyer);
  const supplier = await login(s.target.email);

  await capture(OUT, [
    { name: '01-zakazchik-kartochka-tovara', origin: FRONT, storage: { huphup_token: buyer.token },
      path: `/products/${s.target.productId}`, note: 'заказчик: карточка товара + форма прямого запроса' },
    { name: '02-zakazchik-zayavka-1-postavshik', origin: FRONT, storage: { huphup_token: buyer.token },
      path: `/requests/${s.request.id}`, note: 'заказчик: заявка адресована 1 поставщику' },
    { name: '03-postavshik-grandsteel-vhodyashchie', origin: FRONT, storage: { huphup_token: supplier.token },
      path: s.targetLeadId ? `/supplier/leads?leadId=${s.targetLeadId}` : '/supplier/leads',
      note: 'Grand Steel: прямой лид, score 100' },
  ]);
  console.log(`\nГотово. Скрины в ${OUT}`);
}

main().catch((e) => { console.error('screenshot.mjs упал:', e.stack || e.message); process.exit(1); });
