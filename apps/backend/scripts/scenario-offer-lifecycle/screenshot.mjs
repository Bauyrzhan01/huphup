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
  const sup = await login(s.acceptSupplierEmail);
  await capture(OUT, [
    { name: '01-zakazchik-KP-statusy', origin: FRONT, storage: { huphup_token: buyer.token },
      path: `/offers?requestId=${s.requestId}`, wait: 4200,
      note: 'заказчик: принято / отклонено / отозвано' },
    { name: '02-pobeditel-moi-KP', origin: FRONT, storage: { huphup_token: sup.token },
      path: '/supplier/offers', wait: 4000, note: 'победитель: его КП принято' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
