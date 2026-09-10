/**
 * Прямой доступ к БД для тех шагов, которых нет в API (перевод времени вперёд,
 * фикс комиссии в обход админ-UI и т.п.). Тонкий слой над @prisma/client
 * из apps/backend (DATABASE_URL берём из apps/backend/.env).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(BACKEND_DIR, 'package.json'));
require('dotenv').config({ path: join(BACKEND_DIR, '.env') });
const { PrismaClient } = require('@prisma/client');

let _prisma;
export function prisma() {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}
export async function disconnect() {
  if (_prisma) await _prisma.$disconnect();
  _prisma = undefined;
}

/** Переводит автовыпуск сделки в прошлое, чтобы следующий GET /deals её выпустил. */
export async function backdateDealAutoRelease(dealId, daysAgo = 1) {
  await prisma().deal.update({
    where: { id: dealId },
    data: { autoReleaseAt: new Date(Date.now() - daysAgo * 864e5) },
  });
}

/** Обнуляет кошелёк пользователя/компании (для сценария «нет денег»). */
export async function zeroWallet({ userId, companyId }) {
  const where = userId ? { userId } : { companyId };
  const w = await prisma().wallet.findUnique({ where });
  if (w) {
    await prisma().wallet.update({ where: { id: w.id }, data: { balance: 0 } });
    await prisma().walletTransaction.deleteMany({ where: { walletId: w.id } });
  }
}
