/**
 * Заводит (или обновляет) ADMIN-пользователя напрямую в БД — self-register
 * админов бэкенд запрещает. Плюс helper для пополнения кошелька покупателя
 * (через admin-API, чтобы это был честный путь площадки).
 *
 * Использует @prisma/client и bcrypt из apps/backend.
 *
 * export:
 *   ensureAdmin()            -> { email, password, token, userId }
 *   topUpUserWallet(adminToken, userId, amount, comment)
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apiJson, login, must, PASSWORD } from './huphup-client.mjs';

const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(BACKEND_DIR, 'package.json'));
// PrismaClient читает DATABASE_URL из окружения — бэкенд берёт его из .env через
// @nestjs/config, а отдельный скрипт нет, поэтому подгружаем .env вручную.
require('dotenv').config({ path: join(BACKEND_DIR, '.env') });
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcrypt');

const ADMIN_EMAIL = 'admin.scenario@scenario.huphup.test';

export async function ensureAdmin() {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, role: UserRole.ADMIN, isActive: true, fullName: 'Сценарий Админ' },
        })
      : await prisma.user.create({
          data: {
            email: ADMIN_EMAIL,
            passwordHash,
            fullName: 'Сценарий Админ',
            role: UserRole.ADMIN,
            phone: '+77000000001',
            wallet: { create: {} },
          },
        });
    await prisma.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });

    const { token } = await login(ADMIN_EMAIL);
    return { email: ADMIN_EMAIL, password: PASSWORD, token, userId: user.id };
  } finally {
    await prisma.$disconnect();
  }
}

export async function topUpUserWallet(adminToken, userId, amount, comment) {
  const res = await apiJson('/admin/billing/topup', {
    method: 'POST',
    token: adminToken,
    body: { userId, amount, comment: comment || 'Сценарий: пополнение под сделку' },
  });
  return must(res, 'POST /admin/billing/topup');
}
