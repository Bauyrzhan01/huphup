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
  const owner = await login(s.ownerEmail);
  const manager = await login(s.managerEmail);
  await capture(OUT, [
    { name: '01-vladelec-komanda', origin: FRONT, storage: { huphup_token: owner.token },
      path: '/supplier/team', wait: 4000, note: 'владелец: команда компании (owner + принятый менеджер)' },
    { name: '02-lid-naznachen-menedzheru', origin: FRONT, storage: { huphup_token: owner.token },
      path: `/supplier/leads?leadId=${s.leadId}`, wait: 4200, note: 'лид назначен на менеджера' },
    { name: '03-menedzher-vhodyashchie', origin: FRONT, storage: { huphup_token: manager.token },
      path: '/supplier/leads', wait: 4000, note: 'менеджер видит назначенный ему лид' },
  ]);
  console.log('\nГотово:', OUT);
}
main().catch((e) => { console.error('screenshot упал:', e.message); process.exit(1); });
