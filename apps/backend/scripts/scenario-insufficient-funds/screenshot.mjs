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
  await capture(OUT, [
    { name: '01-zakazchik-balans-popolnenie', origin: FRONT, storage: { huphup_token: buyer.token },
      path: '/balance', wait: 4000, note: 'заказчик: пополнение админом «по счёту №77» после отказа 402' },
    { name: '02-zakazchik-sdelka-oplachena', origin: FRONT, storage: { huphup_token: buyer.token },
      path: '/deals', wait: 4200, note: 'заказчик: после пополнения оплата прошла — сделка на удержании' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
