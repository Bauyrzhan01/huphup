import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BillingReason, DealStatus, Prisma } from '@prisma/client';
import type { BillingService } from '../billing/billing.service';
import type { CompaniesService } from '../companies/companies.service';
import type {
  GeminiDisputeTriage,
  GeminiService,
} from '../gemini/gemini.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AUTO_RELEASE_DAYS, DealsService } from './deals.service';

const BUYER = 'buyer-1';
const MANAGER = 'manager-1';
const COMPANY = 'company-1';

type DealRow = {
  id: string;
  offerId: string;
  requestId: string;
  buyerId: string;
  companyId: string;
  amount: Prisma.Decimal;
  commission: Prisma.Decimal;
  currency: string;
  status: DealStatus;
  fundedAt: Date | null;
  shippedAt: Date | null;
  autoReleaseAt: Date | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  disputeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Move = {
  amount: Prisma.Decimal;
  reason?: BillingReason;
  idempotencyKey: string;
  walletId: string;
};

function buildDeal(over: Partial<DealRow> = {}): DealRow {
  return {
    id: 'deal-1',
    offerId: 'offer-1',
    requestId: 'request-1',
    buyerId: BUYER,
    companyId: COMPANY,
    amount: new Prisma.Decimal(450000),
    commission: new Prisma.Decimal(0),
    currency: 'KZT',
    status: DealStatus.AWAITING_PAYMENT,
    fundedAt: null,
    shippedAt: null,
    autoReleaseAt: null,
    releasedAt: null,
    refundedAt: null,
    disputeReason: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...over,
  };
}

const relations = {
  request: {
    id: 'request-1',
    code: 'HH-1001',
    title: 'Цемент М400',
    city: 'Алматы',
  },
  company: { id: COMPANY, name: 'Алматы Цемент Опт', city: 'Алматы' },
  buyer: { id: BUYER, fullName: 'Айгуль', email: 'buyer@huphup.test' },
  offer: {
    id: 'offer-1',
    price: new Prisma.Decimal(450000),
    currency: 'KZT',
    deliveryDays: 3,
  },
};

function build(initial: Partial<DealRow> = {}, commissionPercent?: number) {
  const state = { deal: buildDeal(initial), moves: [] as Move[] };

  const prisma = {
    deal: {
      findUnique: jest.fn(() =>
        Promise.resolve({ ...state.deal, ...relations }),
      ),
      findMany: jest.fn((args: { where?: { status?: DealStatus } }) => {
        const wanted = args?.where?.status;
        const match = !wanted || state.deal.status === wanted;
        return Promise.resolve(match ? [{ ...state.deal, ...relations }] : []);
      }),
      update: jest.fn((args: { data: Partial<DealRow> }) => {
        state.deal = { ...state.deal, ...args.data, updatedAt: new Date() };
        return Promise.resolve({ ...state.deal, ...relations });
      }),
      create: jest.fn(() => Promise.resolve({ ...state.deal, ...relations })),
    },
  };

  const billing = {
    getOrCreateWallet: jest.fn(
      (owner: { userId?: string; companyId?: string }) =>
        Promise.resolve({
          id: owner.userId ? 'wallet-buyer' : 'wallet-company',
        }),
    ),
    move: jest.fn((input: Move) => {
      state.moves.push(input);
      return Promise.resolve({ duplicate: false });
    }),
    resolvePrice: jest.fn(() =>
      Promise.resolve(
        commissionPercent === undefined
          ? null
          : {
              reason: BillingReason.DEAL_COMMISSION,
              enabled: true,
              amount: new Prisma.Decimal(0),
              percent: new Prisma.Decimal(commissionPercent),
              scope: 'platform' as const,
            },
      ),
    ),
  };

  const companies = {
    resolveCompanyForUser: jest.fn((userId: string) =>
      Promise.resolve(
        userId === MANAGER
          ? { company: { id: COMPANY, name: 'Алматы Цемент Опт' } }
          : null,
      ),
    ),
    listMemberUserIds: jest.fn(() => Promise.resolve([MANAGER])),
  };

  const notifications = {
    notifyUsers: jest.fn(() => Promise.resolve({ count: 1 })),
  };

  const gemini = {
    triageDispute: jest.fn<Promise<GeminiDisputeTriage | null>, []>(() =>
      Promise.resolve(null),
    ),
  };

  const service = new DealsService(
    prisma as unknown as PrismaService,
    billing as unknown as BillingService,
    companies as unknown as CompaniesService,
    gemini as unknown as GeminiService,
    notifications as unknown as NotificationsService,
  );

  return { service, state, billing, notifications, gemini };
}

describe('DealsService — сейф-сделка', () => {
  describe('оплата', () => {
    it('замораживает деньги покупателя и переводит сделку в удержание', async () => {
      const { service, state } = build();

      await service.pay(BUYER, 'deal-1');

      expect(state.deal.status).toBe(DealStatus.HELD);
      expect(state.deal.fundedAt).not.toBeNull();
      expect(state.moves).toHaveLength(1);
      expect(state.moves[0].amount.toString()).toBe('-450000');
      expect(state.moves[0].reason).toBe(BillingReason.ESCROW_HOLD);
      expect(state.moves[0].walletId).toBe('wallet-buyer');
    });

    it('ключ списания привязан к сделке, поэтому повтор не спишет дважды', async () => {
      const { service, state } = build();
      await service.pay(BUYER, 'deal-1');
      expect(state.moves[0].idempotencyKey).toBe('ESCROW_HOLD:deal-1');
    });

    it('поставщик не может оплатить за покупателя', async () => {
      const { service } = build();
      await expect(service.pay(MANAGER, 'deal-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('нельзя оплатить дважды', async () => {
      const { service } = build({ status: DealStatus.HELD });
      await expect(service.pay(BUYER, 'deal-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('отгрузка', () => {
    it('запускает срок автовыпуска', async () => {
      const { service, state } = build({ status: DealStatus.HELD });

      await service.ship(MANAGER, 'deal-1');

      expect(state.deal.status).toBe(DealStatus.SHIPPED);
      const days =
        (state.deal.autoReleaseAt!.getTime() - Date.now()) /
        (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(AUTO_RELEASE_DAYS);
    });

    it('покупатель не может отметить отгрузку', async () => {
      const { service } = build({ status: DealStatus.HELD });
      await expect(service.ship(BUYER, 'deal-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('нельзя отгрузить неоплаченную сделку', async () => {
      const { service } = build({ status: DealStatus.AWAITING_PAYMENT });
      await expect(service.ship(MANAGER, 'deal-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('выдача денег', () => {
    it('подтверждение покупателя отправляет всю сумму поставщику', async () => {
      const { service, state } = build({ status: DealStatus.SHIPPED });

      await service.confirm(BUYER, 'deal-1');

      expect(state.deal.status).toBe(DealStatus.RELEASED);
      expect(state.moves).toHaveLength(1);
      expect(state.moves[0].amount.toString()).toBe('450000');
      expect(state.moves[0].reason).toBe(BillingReason.ESCROW_RELEASE);
      expect(state.moves[0].walletId).toBe('wallet-company');
    });

    it('без правила в прайсе комиссия равна нулю', async () => {
      const { service, state } = build({ status: DealStatus.SHIPPED });
      await service.confirm(BUYER, 'deal-1');
      expect(state.deal.commission.toString()).toBe('0');
    });

    it('включённый процент удерживается из выплаты', async () => {
      const { service, state } = build({ status: DealStatus.SHIPPED }, 2.5);

      await service.confirm(BUYER, 'deal-1');

      expect(state.deal.commission.toString()).toBe('11250');
      expect(state.moves[0].amount.toString()).toBe('438750');
    });

    it('нельзя подтвердить получение до отгрузки', async () => {
      const { service } = build({ status: DealStatus.HELD });
      await expect(service.confirm(BUYER, 'deal-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('автовыпуск', () => {
    it('выдаёт деньги, когда срок ожидания истёк', async () => {
      const { service, state } = build({
        status: DealStatus.SHIPPED,
        shippedAt: new Date('2026-09-01T10:00:00Z'),
        autoReleaseAt: new Date('2026-09-08T10:00:00Z'),
      });

      const released = await service.releaseDueDeals(
        new Date('2026-09-09T10:00:00Z'),
      );

      expect(released).toBe(1);
      expect(state.deal.status).toBe(DealStatus.RELEASED);
      expect(state.moves[0].reason).toBe(BillingReason.ESCROW_RELEASE);
    });

    it('не трогает сделки, у которых срок ещё не подошёл', async () => {
      const { service, state } = build({ status: DealStatus.HELD });
      const released = await service.releaseDueDeals(
        new Date('2026-09-02T10:00:00Z'),
      );
      expect(released).toBe(0);
      expect(state.moves).toHaveLength(0);
    });
  });

  describe('возврат и спор', () => {
    it('отмена до отгрузки возвращает деньги покупателю', async () => {
      const { service, state } = build({ status: DealStatus.HELD });

      await service.cancel(BUYER, 'deal-1', 'Передумал');

      expect(state.deal.status).toBe(DealStatus.REFUNDED);
      expect(state.moves[0].amount.toString()).toBe('450000');
      expect(state.moves[0].reason).toBe(BillingReason.ESCROW_REFUND);
      expect(state.moves[0].walletId).toBe('wallet-buyer');
    });

    it('после отгрузки отменить нельзя — только спор', async () => {
      const { service } = build({ status: DealStatus.SHIPPED });
      await expect(service.cancel(BUYER, 'deal-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('спор останавливает автовыпуск', async () => {
      const { service, state } = build({
        status: DealStatus.SHIPPED,
        autoReleaseAt: new Date('2026-09-08T10:00:00Z'),
      });

      await service.dispute(BUYER, 'deal-1', 'Привезли 8 тонн вместо 10');

      expect(state.deal.status).toBe(DealStatus.DISPUTED);
      expect(state.deal.autoReleaseAt).toBeNull();
      expect(state.deal.disputeReason).toContain('8 тонн');
    });

    it('админ решает спор в пользу поставщика', async () => {
      const { service, state } = build({ status: DealStatus.DISPUTED });

      await service.adminRelease('deal-1', 'admin-1');

      expect(state.deal.status).toBe(DealStatus.RELEASED);
      expect(state.moves[0].walletId).toBe('wallet-company');
    });

    it('админ решает спор в пользу покупателя', async () => {
      const { service, state } = build({ status: DealStatus.DISPUTED });

      await service.adminRefund('deal-1', 'admin-1', 'Товар не соответствует');

      expect(state.deal.status).toBe(DealStatus.REFUNDED);
      expect(state.moves[0].walletId).toBe('wallet-buyer');
    });

    it('по выданной сделке возвращать уже нечего', async () => {
      const { service } = build({ status: DealStatus.RELEASED });
      await expect(
        service.adminRefund('deal-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ИИ-разбор спора', () => {
    it('отдаёт рекомендацию модели, не трогая деньги и статус', async () => {
      const { service, state, gemini } = build({
        status: DealStatus.DISPUTED,
        disputeReason: 'Привезли меньше, чем заказано',
      });
      gemini.triageDispute.mockResolvedValue({
        summary: 'Недопоставка товара.',
        recommendation: 'REFUND',
        reasoning: 'Покупатель описал нехватку количества.',
      });

      const result = await service.adminAiSummary('deal-1');

      expect(result).toEqual({
        available: true,
        triage: {
          summary: 'Недопоставка товара.',
          recommendation: 'REFUND',
          reasoning: 'Покупатель описал нехватку количества.',
        },
      });
      expect(state.moves).toHaveLength(0);
      expect(state.deal.status).toBe(DealStatus.DISPUTED);
    });

    it('передаёт сумму, срок и причину спора в запрос к модели', async () => {
      const { service, gemini } = build({
        status: DealStatus.DISPUTED,
        disputeReason: 'Товар пришёл повреждённым',
      });

      await service.adminAiSummary('deal-1');

      expect(gemini.triageDispute).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '450000',
          currency: 'KZT',
          disputeReason: 'Товар пришёл повреждённым',
        }),
      );
    });

    it('честно сообщает, когда модель недоступна, а не выдумывает рекомендацию', async () => {
      const { service, gemini } = build({ status: DealStatus.DISPUTED });
      gemini.triageDispute.mockResolvedValue(null);

      const result = await service.adminAiSummary('deal-1');

      expect(result.available).toBe(false);
      expect(!result.available && result.reason.length > 0).toBe(true);
    });

    it('доступен только для спорных сделок', async () => {
      const { service } = build({ status: DealStatus.HELD });
      await expect(service.adminAiSummary('deal-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
