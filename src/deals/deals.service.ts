import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingReason,
  Deal,
  DealStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { CompaniesService } from '../companies/companies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Сколько ждём подтверждения покупателя после отгрузки, прежде чем выдать деньги сами. */
export const AUTO_RELEASE_DAYS = 7;

const dealInclude = {
  request: { select: { id: true, code: true, title: true, city: true } },
  company: { select: { id: true, name: true, city: true } },
  buyer: { select: { id: true, fullName: true, email: true } },
  offer: {
    select: { id: true, price: true, currency: true, deliveryDays: true },
  },
} as const;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly companies: CompaniesService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Создаётся при акцепте КП. Денег ещё не касаемся: покупатель платит
   * отдельным шагом, поэтому сделка рождается в состоянии «ждём оплату».
   */
  async createForAcceptedOffer(input: {
    offerId: string;
    requestId: string;
    buyerId: string;
    companyId: string;
    amount: Prisma.Decimal | number;
    currency: string;
  }): Promise<Deal> {
    const existing = await this.prisma.deal.findUnique({
      where: { offerId: input.offerId },
    });
    if (existing) return existing;

    return this.prisma.deal.create({
      data: {
        offerId: input.offerId,
        requestId: input.requestId,
        buyerId: input.buyerId,
        companyId: input.companyId,
        amount: new Prisma.Decimal(input.amount).toDecimalPlaces(2),
        currency: input.currency,
        status: DealStatus.AWAITING_PAYMENT,
      },
    });
  }

  // ------------------------------------------------------------------ чтение

  async listMine(userId: string) {
    await this.releaseDueDeals();

    const company = await this.companies.resolveCompanyForUser(userId);
    const where: Prisma.DealWhereInput = company
      ? { companyId: company.company.id }
      : { buyerId: userId };

    const deals = await this.prisma.deal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: dealInclude,
    });

    return deals.map((deal) =>
      serializeDeal(deal, company ? 'supplier' : 'buyer'),
    );
  }

  async getOne(userId: string, dealId: string) {
    await this.releaseDueDeals();
    const { deal, side } = await this.requireAccess(userId, dealId);
    return serializeDeal(deal, side);
  }

  // ----------------------------------------------------------------- переходы

  /** Покупатель замораживает деньги: они уходят с его баланса площадке. */
  async pay(userId: string, dealId: string) {
    const { deal } = await this.requireAccess(userId, dealId, 'buyer');
    this.expect(deal, DealStatus.AWAITING_PAYMENT);

    // Списываем ровно сумму сделки; при нехватке денег BillingService
    // откатит всё и бросит 402 — сделка останется неоплаченной.
    await this.billing.move({
      walletId: (await this.billing.getOrCreateWallet({ userId })).id,
      amount: new Prisma.Decimal(deal.amount).negated(),
      reason: BillingReason.ESCROW_HOLD,
      idempotencyKey: `ESCROW_HOLD:${deal.id}`,
      createdById: userId,
      comment: `Оплата сделки по заявке ${deal.requestId}`,
      offerId: deal.offerId,
      requestId: deal.requestId,
    });

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: { status: DealStatus.HELD, fundedAt: new Date() },
      include: dealInclude,
    });

    await this.notifyCompany(deal.companyId, {
      type: NotificationType.BILLING,
      title: 'Сделка оплачена',
      body: 'Деньги на удержании у HupHup, можно отгружать.',
      payload: { dealId: deal.id, offerId: deal.offerId },
    });

    return serializeDeal(updated, 'buyer');
  }

  /** Поставщик отмечает отгрузку — с этого момента идёт срок автовыпуска. */
  async ship(userId: string, dealId: string) {
    const { deal } = await this.requireAccess(userId, dealId, 'supplier');
    this.expect(deal, DealStatus.HELD);

    const autoReleaseAt = new Date(
      Date.now() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000,
    );

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: DealStatus.SHIPPED,
        shippedAt: new Date(),
        autoReleaseAt,
      },
      include: dealInclude,
    });

    await this.notifications.notifyUsers([deal.buyerId], {
      type: NotificationType.BILLING,
      title: 'Заказ отгружен',
      body: `Подтвердите получение. Через ${AUTO_RELEASE_DAYS} дней деньги уйдут поставщику автоматически.`,
      payload: { dealId: deal.id, offerId: deal.offerId },
    });

    return serializeDeal(updated, 'supplier');
  }

  /** Покупатель подтвердил получение — деньги уходят поставщику. */
  async confirm(userId: string, dealId: string) {
    const { deal } = await this.requireAccess(userId, dealId, 'buyer');
    this.expect(deal, DealStatus.SHIPPED);
    const updated = await this.release(deal, 'buyer');
    return serializeDeal(updated, 'buyer');
  }

  /** До отгрузки покупатель может отменить — деньги возвращаются ему. */
  async cancel(userId: string, dealId: string, reason?: string) {
    const { deal, side } = await this.requireAccess(userId, dealId);
    if (
      deal.status !== DealStatus.HELD &&
      deal.status !== DealStatus.AWAITING_PAYMENT
    ) {
      throw new BadRequestException(
        'Отменить можно только до отгрузки; после — через спор',
      );
    }

    const updated =
      deal.status === DealStatus.HELD
        ? await this.refund(deal, reason)
        : await this.prisma.deal.update({
            where: { id: deal.id },
            data: { status: DealStatus.REFUNDED, refundedAt: new Date() },
            include: dealInclude,
          });

    return serializeDeal(updated, side);
  }

  /** Спор останавливает автовыпуск: дальше решает площадка. */
  async dispute(userId: string, dealId: string, reason: string) {
    const { deal, side } = await this.requireAccess(userId, dealId);
    if (deal.status !== DealStatus.SHIPPED && deal.status !== DealStatus.HELD) {
      throw new BadRequestException(
        'Спор можно открыть только по активной сделке',
      );
    }

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: DealStatus.DISPUTED,
        disputeReason: reason.slice(0, 1000),
        autoReleaseAt: null,
      },
      include: dealInclude,
    });

    return serializeDeal(updated, side);
  }

  // ------------------------------------------------------------------- админ

  async adminList(status?: DealStatus) {
    await this.releaseDueDeals();
    const deals = await this.prisma.deal.findMany({
      where: status ? { status } : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: dealInclude,
    });
    return deals.map((deal) => serializeDeal(deal, 'admin'));
  }

  async adminRelease(dealId: string, adminId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    if (
      deal.status !== DealStatus.SHIPPED &&
      deal.status !== DealStatus.DISPUTED
    ) {
      throw new BadRequestException(
        'Выдать можно отгруженную или спорную сделку',
      );
    }
    const updated = await this.release(deal, 'admin', adminId);
    return serializeDeal(updated, 'admin');
  }

  async adminRefund(dealId: string, adminId: string, reason?: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    if (
      deal.status !== DealStatus.HELD &&
      deal.status !== DealStatus.SHIPPED &&
      deal.status !== DealStatus.DISPUTED
    ) {
      throw new BadRequestException(
        'Возвращать нечего: деньги не на удержании',
      );
    }
    const updated = await this.refund(deal, reason, adminId);
    return serializeDeal(updated, 'admin');
  }

  /**
   * Планировщика в проекте нет, поэтому просроченные сделки выпускаются
   * лениво — при любом чтении списка. Ошибка по одной сделке не должна
   * ломать выдачу остальных.
   */
  async releaseDueDeals(now = new Date()): Promise<number> {
    const due = await this.prisma.deal.findMany({
      where: {
        status: DealStatus.SHIPPED,
        autoReleaseAt: { not: null, lte: now },
      },
      take: 20,
    });

    let released = 0;
    for (const deal of due) {
      try {
        await this.release(deal, 'auto');
        released += 1;
      } catch (err) {
        this.logger.warn(
          `Автовыпуск сделки ${deal.id} не удался: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return released;
  }

  // ------------------------------------------------------------------ деньги

  private async release(
    deal: Deal,
    by: 'buyer' | 'admin' | 'auto',
    actorId?: string,
  ): Promise<DealWithRelations> {
    const amount = new Prisma.Decimal(deal.amount);
    const commission = await this.commissionFor(deal.companyId, amount);
    const payout = amount.sub(commission);

    const wallet = await this.billing.getOrCreateWallet({
      companyId: deal.companyId,
    });

    await this.billing.move({
      walletId: wallet.id,
      amount: payout,
      reason: BillingReason.ESCROW_RELEASE,
      idempotencyKey: `ESCROW_RELEASE:${deal.id}`,
      createdById: actorId,
      comment:
        by === 'auto'
          ? `Автовыпуск через ${AUTO_RELEASE_DAYS} дней после отгрузки`
          : 'Покупатель подтвердил получение',
      offerId: deal.offerId,
      requestId: deal.requestId,
      meta: { commission: commission.toString(), releasedBy: by },
    });

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: DealStatus.RELEASED,
        commission,
        releasedAt: new Date(),
        autoReleaseAt: null,
      },
      include: dealInclude,
    });

    await this.notifyCompany(deal.companyId, {
      type: NotificationType.BILLING,
      title: 'Деньги по сделке зачислены',
      body: `На баланс компании поступило ${payout.toString()} ${deal.currency}.`,
      payload: { dealId: deal.id },
    });

    return updated;
  }

  private async refund(
    deal: Deal,
    reason?: string,
    actorId?: string,
  ): Promise<DealWithRelations> {
    const wallet = await this.billing.getOrCreateWallet({
      userId: deal.buyerId,
    });

    await this.billing.move({
      walletId: wallet.id,
      amount: new Prisma.Decimal(deal.amount),
      reason: BillingReason.ESCROW_REFUND,
      idempotencyKey: `ESCROW_REFUND:${deal.id}`,
      createdById: actorId,
      comment: reason?.slice(0, 500) ?? 'Возврат по сделке',
      offerId: deal.offerId,
      requestId: deal.requestId,
    });

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: DealStatus.REFUNDED,
        refundedAt: new Date(),
        autoReleaseAt: null,
        ...(reason ? { disputeReason: reason.slice(0, 1000) } : {}),
      },
      include: dealInclude,
    });

    await this.notifications.notifyUsers([deal.buyerId], {
      type: NotificationType.BILLING,
      title: 'Деньги возвращены',
      body: `На ваш баланс вернулось ${deal.amount.toString()} ${deal.currency}.`,
      payload: { dealId: deal.id },
    });

    return updated;
  }

  /** Комиссия площадки берётся из прайс-листа; без правила она нулевая. */
  private async commissionFor(
    companyId: string,
    amount: Prisma.Decimal,
  ): Promise<Prisma.Decimal> {
    const price = await this.billing.resolvePrice(
      BillingReason.DEAL_COMMISSION,
      companyId,
    );
    if (!price?.enabled) return new Prisma.Decimal(0);

    const value = price.percent
      ? amount.mul(price.percent).div(100)
      : price.amount;

    const rounded = value.toDecimalPlaces(2);
    if (rounded.lessThan(0)) return new Prisma.Decimal(0);
    return rounded.greaterThan(amount) ? amount : rounded;
  }

  // ----------------------------------------------------------------- helpers

  private async requireAccess(
    userId: string,
    dealId: string,
    need?: 'buyer' | 'supplier',
  ): Promise<{ deal: DealWithRelations; side: 'buyer' | 'supplier' }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: dealInclude,
    });
    if (!deal) throw new NotFoundException('Сделка не найдена');

    const isBuyer = deal.buyerId === userId;
    const company = isBuyer
      ? null
      : await this.companies.resolveCompanyForUser(userId);
    const isSupplier = company?.company.id === deal.companyId;

    if (!isBuyer && !isSupplier) {
      throw new ForbiddenException('Это не ваша сделка');
    }
    const side = isBuyer ? 'buyer' : 'supplier';
    if (need && need !== side) {
      throw new ForbiddenException(
        need === 'buyer'
          ? 'Действие доступно только покупателю'
          : 'Действие доступно только поставщику',
      );
    }
    return { deal, side };
  }

  private expect(deal: Deal, status: DealStatus) {
    if (deal.status !== status) {
      throw new BadRequestException(
        `Сделка в состоянии ${deal.status}, ожидалось ${status}`,
      );
    }
  }

  private async notifyCompany(
    companyId: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    try {
      const userIds = await this.companies.listMemberUserIds(companyId);
      if (userIds.length) await this.notifications.notifyUsers(userIds, input);
    } catch (err) {
      // Деньги уже перемещены: неудачное уведомление не должно это отменять.
      this.logger.warn(
        `Уведомление компании ${companyId} не ушло: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export function serializeDeal(
  deal: DealWithRelations,
  side: 'buyer' | 'supplier' | 'admin',
) {
  return {
    id: deal.id,
    status: deal.status,
    side,
    amount: deal.amount.toString(),
    commission: deal.commission.toString(),
    payout: deal.amount.sub(deal.commission).toString(),
    currency: deal.currency,
    request: deal.request,
    company: deal.company,
    buyer: side === 'buyer' ? undefined : deal.buyer,
    offerId: deal.offerId,
    deliveryDays: deal.offer.deliveryDays,
    disputeReason: deal.disputeReason,
    fundedAt: deal.fundedAt?.toISOString() ?? null,
    shippedAt: deal.shippedAt?.toISOString() ?? null,
    autoReleaseAt: deal.autoReleaseAt?.toISOString() ?? null,
    releasedAt: deal.releasedAt?.toISOString() ?? null,
    refundedAt: deal.refundedAt?.toISOString() ?? null,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}
