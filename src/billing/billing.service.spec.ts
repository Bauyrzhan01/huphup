import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BillingReason, Prisma, WalletTxType } from '@prisma/client';
import type { CompaniesService } from '../companies/companies.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

type WalletRow = {
  id: string;
  companyId: string | null;
  userId: string | null;
  balance: Prisma.Decimal;
  currency: string;
  lowBalanceNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TxRow = {
  id: string;
  walletId: string;
  type: WalletTxType;
  reason: BillingReason | null;
  amount: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  idempotencyKey: string;
  comment: string | null;
  leadId: string | null;
  offerId: string | null;
  requestId: string | null;
  createdById: string | null;
  createdAt: Date;
};

type PriceRow = {
  reason: BillingReason;
  enabled: boolean;
  amount: Prisma.Decimal;
  percent: Prisma.Decimal | null;
};

function dec(value: number | string) {
  return new Prisma.Decimal(value);
}

/**
 * In-memory stand-in for Prisma: keeps a single wallet, rolls the state back
 * when the transaction callback throws, and rejects duplicate idempotency keys
 * the same way the unique index does.
 */
function buildPrisma(startBalance = 0) {
  const state = {
    wallet: {
      id: 'w1',
      companyId: 'c1',
      userId: null,
      balance: dec(startBalance),
      currency: 'KZT',
      lowBalanceNotifiedAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    } as WalletRow,
    transactions: [] as TxRow[],
    companyPrice: null as PriceRow | null,
    platformPrice: null as PriceRow | null,
  };

  const delegates = {
    wallet: {
      findUnique: jest.fn(() => Promise.resolve({ ...state.wallet })),
      create: jest.fn(() => Promise.resolve({ ...state.wallet })),
      update: jest.fn(
        (args: {
          data: {
            balance?: { increment: Prisma.Decimal };
            lowBalanceNotifiedAt?: Date | null;
          };
        }) => {
          if (args.data.balance) {
            state.wallet.balance = state.wallet.balance.add(
              args.data.balance.increment,
            );
          }
          if ('lowBalanceNotifiedAt' in args.data) {
            state.wallet.lowBalanceNotifiedAt =
              args.data.lowBalanceNotifiedAt ?? null;
          }
          return Promise.resolve({ ...state.wallet });
        },
      ),
    },
    walletTransaction: {
      findUnique: jest.fn((args: { where: { idempotencyKey: string } }) =>
        Promise.resolve(
          state.transactions.find(
            (row) => row.idempotencyKey === args.where.idempotencyKey,
          ) ?? null,
        ),
      ),
      create: jest.fn((args: { data: Omit<TxRow, 'id' | 'createdAt'> }) => {
        const clash = state.transactions.some(
          (row) => row.idempotencyKey === args.data.idempotencyKey,
        );
        if (clash) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate key', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: TxRow = {
          id: `tx${state.transactions.length + 1}`,
          createdAt: new Date(),
          ...args.data,
        };
        state.transactions.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn(() => Promise.resolve(state.transactions)),
      count: jest.fn(() => Promise.resolve(state.transactions.length)),
    },
    companyPrice: {
      findUnique: jest.fn(() => Promise.resolve(state.companyPrice)),
    },
    platformPrice: {
      findUnique: jest.fn(() => Promise.resolve(state.platformPrice)),
    },
    company: {
      findUnique: jest.fn(() => Promise.resolve({ ownerId: 'owner-1' })),
    },
    companyMember: {
      findMany: jest.fn(() => Promise.resolve([{ userId: 'manager-1' }])),
    },
  };

  const prisma = {
    ...delegates,
    $transaction: jest.fn(
      async (cb: (tx: typeof delegates) => Promise<unknown>) => {
        const balanceBefore = state.wallet.balance;
        const txBefore = [...state.transactions];
        try {
          return await cb(delegates);
        } catch (err) {
          state.wallet.balance = balanceBefore;
          state.transactions = txBefore;
          throw err;
        }
      },
    ),
  };

  return { prisma, state };
}

function buildService(startBalance = 0) {
  const { prisma, state } = buildPrisma(startBalance);
  const companies = {
    resolveCompanyForUser: jest.fn(() =>
      Promise.resolve({ company: { id: 'c1', name: 'Алматы Цемент Опт' } }),
    ),
  };
  const notifications = {
    notifyUsers: jest.fn((userIds: string[], _input: unknown) =>
      Promise.resolve({ count: userIds.length }),
    ),
  };
  const config = { get: jest.fn(() => undefined) };

  const service = new BillingService(
    prisma as unknown as PrismaService,
    companies as unknown as CompaniesService,
    notifications as unknown as NotificationsService,
    config as unknown as ConfigService,
  );

  return { service, prisma, state, companies, notifications };
}

describe('BillingService', () => {
  describe('пополнение и списание', () => {
    it('начисляет пополнение и пишет проводку со снимком баланса', async () => {
      const { service, state } = buildService(0);

      const result = await service.topUp({
        owner: { companyId: 'c1' },
        amount: 50000,
        comment: 'Перевод №142',
        createdById: 'admin-1',
      });

      expect(result.balance.toString()).toBe('50000');
      expect(state.transactions).toHaveLength(1);
      expect(state.transactions[0].type).toBe(WalletTxType.TOPUP);
      expect(state.transactions[0].balanceAfter.toString()).toBe('50000');
    });

    it('округляет сумму до двух знаков', async () => {
      const { service, state } = buildService(0);
      await service.topUp({ owner: { companyId: 'c1' }, amount: 100.567 });
      expect(state.transactions[0].amount.toString()).toBe('100.57');
    });
  });

  describe('идемпотентность', () => {
    it('повторный ключ не списывает деньги второй раз', async () => {
      const { service, state } = buildService(10000);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };

      const first = await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-1',
        leadId: 'lead-1',
      });
      const second = await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-1',
        leadId: 'lead-1',
      });

      expect(first.charged).toBe(true);
      expect(second.charged).toBe(true);
      if (first.charged && second.charged) {
        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(true);
      }
      expect(state.wallet.balance.toString()).toBe('8000');
      expect(state.transactions).toHaveLength(1);
    });
  });

  describe('нехватка средств', () => {
    it('бросает 402 и не оставляет ни проводки, ни изменения баланса', async () => {
      const { service, state } = buildService(500);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };

      await expect(
        service.charge({
          owner: { companyId: 'c1' },
          reason: BillingReason.LEAD_UNLOCK,
          idempotencyKey: 'LEAD_UNLOCK:lead-2',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

      expect(state.wallet.balance.toString()).toBe('500');
      expect(state.transactions).toHaveLength(0);
    });

    it('сообщает, сколько нужно и сколько есть', async () => {
      const { service, state } = buildService(500);
      state.platformPrice = {
        reason: BillingReason.OFFER_SENT,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };

      const err = await service
        .charge({
          owner: { companyId: 'c1' },
          reason: BillingReason.OFFER_SENT,
          idempotencyKey: 'OFFER_SENT:offer-1',
        })
        .catch((e: HttpException) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getResponse()).toMatchObject({
        error: 'INSUFFICIENT_FUNDS',
        required: '2000',
        balance: '500',
      });
    });
  });

  describe('цены', () => {
    it('выключенное правило оставляет действие бесплатным', async () => {
      const { service, state } = buildService(10000);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: false,
        amount: dec(2000),
        percent: null,
      };

      const result = await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-3',
      });

      expect(result).toEqual({ charged: false, skipped: 'disabled' });
      expect(state.wallet.balance.toString()).toBe('10000');
      expect(state.transactions).toHaveLength(0);
    });

    it('отсутствие правила тоже оставляет действие бесплатным', async () => {
      const { service } = buildService(10000);
      const result = await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.DEAL_COMMISSION,
        idempotencyKey: 'DEAL_COMMISSION:offer-9',
      });
      expect(result).toEqual({ charged: false, skipped: 'disabled' });
    });

    it('цена компании перекрывает платформенную', async () => {
      const { service, state } = buildService(10000);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };
      state.companyPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(500),
        percent: null,
      };

      await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-4',
      });

      expect(state.wallet.balance.toString()).toBe('9500');
    });

    it('считает комиссию процентом от суммы сделки', async () => {
      const { service, state } = buildService(10000);
      state.platformPrice = {
        reason: BillingReason.DEAL_COMMISSION,
        enabled: true,
        amount: dec(0),
        percent: dec(2.5),
      };

      const result = await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.DEAL_COMMISSION,
        idempotencyKey: 'DEAL_COMMISSION:offer-2',
        base: 450000,
        // Комиссия по акцептованной сделке списывается даже в долг.
        allowNegative: true,
      });

      expect(result.charged).toBe(true);
      if (result.charged) {
        expect(result.amount.toString()).toBe('11250');
      }
      expect(state.wallet.balance.toString()).toBe('-1250');
    });
  });

  describe('долг', () => {
    it('комиссия уводит баланс в минус, когда это разрешено', async () => {
      const { service, state } = buildService(100);
      state.platformPrice = {
        reason: BillingReason.DEAL_COMMISSION,
        enabled: true,
        amount: dec(5000),
        percent: null,
      };

      await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.DEAL_COMMISSION,
        idempotencyKey: 'DEAL_COMMISSION:offer-3',
        allowNegative: true,
      });

      expect(state.wallet.balance.toString()).toBe('-4900');
    });

    it('следующая покупка при долге отбивается 402', async () => {
      const { service, state } = buildService(-100);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(1000),
        percent: null,
      };

      await expect(
        service.charge({
          owner: { companyId: 'c1' },
          reason: BillingReason.LEAD_UNLOCK,
          idempotencyKey: 'LEAD_UNLOCK:lead-5',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

      expect(state.transactions).toHaveLength(0);
    });
  });

  describe('уведомление о низком балансе', () => {
    it('предупреждает владельца и менеджеров, когда остаток мал', async () => {
      const { service, state, notifications } = buildService(6000);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };

      await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-6',
      });

      expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
      const [userIds] = notifications.notifyUsers.mock.calls[0];
      expect(userIds).toEqual(['owner-1', 'manager-1']);
    });

    it('молчит, пока остаток выше порога', async () => {
      const { service, state, notifications } = buildService(50000);
      state.platformPrice = {
        reason: BillingReason.LEAD_UNLOCK,
        enabled: true,
        amount: dec(2000),
        percent: null,
      };

      await service.charge({
        owner: { companyId: 'c1' },
        reason: BillingReason.LEAD_UNLOCK,
        idempotencyKey: 'LEAD_UNLOCK:lead-7',
      });

      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });
  });

  describe('кошелёк пользователя', () => {
    it('поставщику отдаёт кошелёк компании', async () => {
      const { service } = buildService(1000);
      const wallet = await service.myWallet('user-1');
      expect(wallet.scope).toBe('company');
      expect(wallet.balance).toBe('1000');
      expect(wallet.companyName).toBe('Алматы Цемент Опт');
    });

    it('покупателю — личный кошелёк', async () => {
      const { service, companies } = buildService(0);
      companies.resolveCompanyForUser.mockResolvedValue(
        null as unknown as { company: { id: string; name: string } },
      );

      const wallet = await service.myWallet('buyer-1');
      expect(wallet.scope).toBe('user');
      expect(wallet.lowBalance).toBe(true);
    });
  });
});
