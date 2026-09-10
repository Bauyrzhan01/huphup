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
  const sup = await login(s.supplierEmail);
  await capture(OUT, [
    { name: '01-lid-crm-timeline', origin: FRONT, storage: { huphup_token: sup.token },
      path: `/supplier/leads?leadId=${s.leadId}`, wait: 4200,
      note: 'лид: следующий шаг, задачи, заметки, лента активности' },
    { name: '02-crm-board', origin: FRONT, storage: { huphup_token: sup.token },
      path: '/supplier/deals', wait: 4000, note: 'CRM: доска лидов' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
