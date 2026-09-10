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
    // сид диалога в sessionStorage -> главная показывает ИИ-чат + кнопку «Опубликовать»
    { name: '01-zakazchik-ii-chat-zayavki', origin: FRONT,
      storage: { huphup_token: buyer.token },
      session: { [s.homeChatKey]: JSON.stringify(s.homeChat) },
      path: '/app', wait: 4200, note: 'заказчик: ИИ собрал заявку из свободного текста' },
    { name: '02-zakazchik-opublikovannaya-zayavka', origin: FRONT,
      storage: { huphup_token: buyer.token },
      path: `/requests/${s.requestId}`, note: 'итог: опубликованная заявка + подобранные поставщики' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
