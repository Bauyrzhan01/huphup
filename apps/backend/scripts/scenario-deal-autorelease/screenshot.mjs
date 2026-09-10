#!/usr/bin/env node
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
  const sup = await login(s.supplierEmail);
  await capture(OUT, [
    { name: '01-zakazchik-sdelka-avtovypusk', origin: FRONT, storage: { huphup_token: buyer.token },
      path: '/deals', wait: 4200, note: 'заказчик: сделка выпущена автоматически через 7 дней' },
    { name: '02-postavshik-balans-avtovypusk', origin: FRONT, storage: { huphup_token: sup.token },
      path: '/balance', wait: 4000, note: 'поставщик: проводка «Автовыпуск через 7 дней после отгрузки»' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
