/**
 * Чистит данные, созданные сценариями (домен @scenario.huphup.test):
 * заявки, КП, сделки, чаты, лиды, кошельки/движения. Аккаунты, компании и
 * товары НЕ трогает — сценарии их переиспользуют.
 *
 *   node scenario-lib/reset.mjs          — почистить
 *   node scenario-lib/reset.mjs --all    — + удалить и аккаунты/компании/товары
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(BACKEND_DIR, 'package.json'));
require('dotenv').config({ path: join(BACKEND_DIR, '.env') });
const { PrismaClient } = require('@prisma/client');

const DOMAIN = '@scenario.huphup.test';
const wipeAll = process.argv.includes('--all');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) {
    console.log('Сценарных пользователей не найдено — чистить нечего.');
    return;
  }

  const companies = await prisma.company.findMany({
    where: { ownerId: { in: userIds } },
    select: { id: true },
  });
  const companyIds = companies.map((c) => c.id);

  const requests = await prisma.request.findMany({
    where: { buyerId: { in: userIds } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);

  // Порядок — от листьев к корню (на случай отсутствия каскадов).
  const del = [];
  del.push(['walletTransaction', prisma.walletTransaction.deleteMany({
    where: { wallet: { OR: [{ userId: { in: userIds } }, { companyId: { in: companyIds } }] } },
  })]);
  del.push(['deal', prisma.deal.deleteMany({ where: { OR: [{ buyerId: { in: userIds } }, { companyId: { in: companyIds } }] } })]);
  del.push(['offer', prisma.offer.deleteMany({ where: { OR: [{ authorId: { in: userIds } }, { companyId: { in: companyIds } }, { requestId: { in: requestIds } }] } })]);
  del.push(['lead', prisma.lead.deleteMany({ where: { OR: [{ companyId: { in: companyIds } }, { requestId: { in: requestIds } }] } })]);
  del.push(['conversation', prisma.conversation.deleteMany({ where: { requestId: { in: requestIds } } })]);
  del.push(['attachment', prisma.attachment.deleteMany({ where: { requestId: { in: requestIds } } })]);
  del.push(['notification', prisma.notification.deleteMany({ where: { userId: { in: userIds } } })]);
  del.push(['request', prisma.request.deleteMany({ where: { buyerId: { in: userIds } } })]);
  del.push(['wallet', prisma.wallet.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { companyId: { in: companyIds } }] },
  })]);

  if (wipeAll) {
    del.push(['product', prisma.product.deleteMany({ where: { companyId: { in: companyIds } } })]);
    del.push(['companyMember', prisma.companyMember.deleteMany({ where: { OR: [{ companyId: { in: companyIds } }, { userId: { in: userIds } }] } })]);
    del.push(['company', prisma.company.deleteMany({ where: { id: { in: companyIds } } })]);
    del.push(['user', prisma.user.deleteMany({ where: { id: { in: userIds } } })]);
  }

  for (const [name, op] of del) {
    try {
      const r = await op;
      if (r.count) console.log(`  ${name}: -${r.count}`);
    } catch (e) {
      console.log(`  ${name}: пропущено (${e.message.split('\n')[0]})`);
    }
  }
  console.log(wipeAll ? 'Готово: сценарные данные и аккаунты удалены.' : 'Готово: сценарные заявки/сделки/чаты/кошельки очищены (аккаунты сохранены).');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
