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
  const sup = await login(s.supplier.email);
  await capture(OUT, [
    { name: '01-postavshik-karta-tovara', origin: FRONT, storage: { huphup_token: sup.token },
      path: `/supplier/products/${s.productId}`, note: 'поставщик: карточка товара с 2 фото' },
    { name: '02-publichnyy-katalog-tovara', origin: FRONT, storage: { huphup_token: sup.token },
      path: `/products/${s.productId}`, note: 'товар в публичном каталоге' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
