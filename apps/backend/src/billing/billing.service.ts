import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingReason,
  NotificationType,
  Prisma,
  Wallet,
  WalletTransaction,
  WalletTransactionType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CompaniesService } from '../companies/companies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** A wallet belongs to exactly one side: a supplier company or a single user. */
export type WalletOwner = { companyId: string } | { userId: string };

export type MoveInput = {
  walletId: string;
  /** Signed: positive credits the wallet, negative debits it. */
  amount: Prisma.Decimal;
  reason?: BillingReason;
  /** The same key never moves money twice — the unique index is the guarantee. */
  idempotencyKey: string;
  createdById?: string;
  comment?: string;
  meta?: Prisma.InputJsonValue;
  leadId?: string;
  offerId?: string;
  requestId?: string;
  /** Commission on an accepted deal may push the wallet into debt. */
  allowNegative?: boolean;
};

export type MoveResult = {
  transaction: WalletTransaction;
  balance: Prisma.Decimal;
  /** True when the key was already used and no money moved this time. */
  duplicate: boolean;
};

export type ChargeInput = {
  owner: WalletOwner;
  reason: BillingReason;
  idempotencyKey: string;
  /** Explicit amount wins over the price list (used for percent-based commission). */
  amount?: Prisma.Decimal | number;
  /** Base for a percent rule, e.g. the offer price. */
  base?: Prisma.Decimal | number;
  createdById?: string;
  comment?: string;
  leadId?: string;
  offerId?: string;
  requestId?: string;
  allowNegative?: boolean;
};

export type ChargeResult =
  | { charged: false; skipped: 'disabled' | 'free' }
  | {
      charged: true;
      amount: Prisma.Decimal;
      balance: Prisma.Decimal;
      duplicate: boolean;
      transaction: WalletTransaction;
    };

export type ResolvedPrice = {
  reason: BillingReason;
  enabled: boolean;
  amount: Prisma.Decimal;
  percent: Prisma.Decimal | null;
  scope: 'company' | 'platform';
};

const DEFAULT_LOW_BALANCE = 5000;
const LOW_BALANCE_NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly lowBalanceThreshold: Prisma.Decimal;

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('BILLING_LOW_BALANCE'));
    this.lowBalanceThreshold = new Prisma.Decimal(
      Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_LOW_BALANCE,
    );
  }

  // ---------------------------------------------------------------- wallets

  async getOrCreateWallet(owner: WalletOwner): Promise<Wallet> {
    const where: Prisma.WalletWhereUniqueInput =
      'companyId' in owner
        ? { companyId: owner.companyId }
        : { userId: owner.userId };

    const existing = await this.prisma.wallet.findUnique({ where });
    if (existing) return existing;

    try {
      return await this.prisma.wallet.create({ data: { ...owner } });
    } catch (err) {
      // Two parallel requests can both miss the read above.
      if (isUniqueViolation(err)) {
        const created = await this.prisma.wallet.findUnique({ where });
        if (created) return created;
      }
      throw err;
    }
  }

  /**
   * Suppliers get their company wallet, everyone else a personal one.
   * `scope: 'user'` asks for the personal wallet even when the user has a
   * company — that is the wallet their own purchases are paid from.
   */
  async ownerForUser(
    userId: string,
    scope?: 'user' | 'company',
  ): Promise<{
    owner: WalletOwner;
    scope: 'company' | 'user';
    companyId?: string;
    companyName?: string;
  }> {
    const resolved =
      scope === 'user'
        ? null
        : await this.companies.resolveCompanyForUser(userId);
    if (resolved) {
      return {
        owner: { companyId: resolved.company.id },
        scope: 'company',
        companyId: resolved.company.id,
        companyName: resolved.company.name,
      };
    }
    return { owner: { userId }, scope: 'user' };
  }

  async myWallet(userId: string, scope?: 'user' | 'company') {
    const resolved = await this.ownerForUser(userId, scope);
    const wallet = await this.getOrCreateWallet(resolved.owner);
    return {
      ...serializeWallet(wallet),
      scope: resolved.scope,
      companyName: resolved.companyName,
      lowBalance: wallet.balance.lessThan(this.lowBalanceThreshold),
      lowBalanceThreshold: this.lowBalanceThreshold.toString(),
    };
  }

  async myTransactions(
    userId: string,
    query: { page?: number; limit?: number; scope?: 'user' | 'company' },
  ) {
    const { scope, ...paging } = query;
    const { owner } = await this.ownerForUser(userId, scope);
    const wallet = await this.getOrCreateWallet(owner);
    return this.listTransactions({ walletId: wallet.id, ...paging });
  }

  async listTransactions(query: {
    walletId?: string;
    reason?: BillingReason;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const where: Prisma.WalletTransactionWhereInput = {
      ...(query.walletId ? { walletId: query.walletId } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map(serializeTransaction),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ------------------------------------------------------------ money moves

  /** The only place in the codebase where a balance changes. */
  async move(input: MoveInput): Promise<MoveResult> {
    const amount = round2(input.amount);
    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        transaction: existing,
        balance: existing.balanceAfter,
        duplicate: true,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.update({
          where: { id: input.walletId },
          data: { balance: { increment: amount } },
        });

        if (!input.allowNegative && wallet.balance.lessThan(ZERO)) {
          // Throwing rolls back the increment above — nothing is written.
          throw insufficientFunds(amount, wallet);
        }

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            // Направление однозначно следует из знака суммы.
            type: amount.lessThan(ZERO)
              ? WalletTransactionType.DEBIT
              : WalletTransactionType.CREDIT,
            reason: input.reason,
            amount,
            balanceAfter: wallet.balance,
            idempotencyKey: input.idempotencyKey,
            createdById: input.createdById,
            comment: input.comment,
            meta: input.meta,
            leadId: input.leadId,
            offerId: input.offerId,
            requestId: input.requestId,
          },
        });

        return { transaction, balance: wallet.balance, duplicate: false };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await this.prisma.walletTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) {
          return {
            transaction: raced,
            balance: raced.balanceAfter,
            duplicate: true,
          };
        }
      }
      if (isRecordNotFound(err)) {
        throw new NotFoundException('Wallet not found');
      }
      throw err;
    }
  }

  async topUp(input: {
    owner: WalletOwner;
    amount: number | Prisma.Decimal;
    comment?: string;
    createdById?: string;
    idempotencyKey?: string;
  }) {
    const wallet = await this.getOrCreateWallet(input.owner);
    const result = await this.move({
      walletId: wallet.id,
      amount: round2(input.amount),
      idempotencyKey: input.idempotencyKey ?? `TOPUP:${randomUUID()}`,
      createdById: input.createdById,
      comment: input.comment,
      allowNegative: true,
    });

    await this.afterBalanceChange(wallet.id, result.balance);
    return result;
  }

  async adjust(input: {
    owner: WalletOwner;
    amount: number | Prisma.Decimal;
    comment: string;
    createdById?: string;
    idempotencyKey?: string;
  }) {
    const wallet = await this.getOrCreateWallet(input.owner);
    const result = await this.move({
      walletId: wallet.id,
      amount: round2(input.amount),
      idempotencyKey: input.idempotencyKey ?? `ADJUST:${randomUUID()}`,
      createdById: input.createdById,
      comment: input.comment,
      // A correction is a deliberate admin action, debt included.
      allowNegative: true,
    });

    await this.afterBalanceChange(wallet.id, result.balance);
    return result;
  }

  /**
   * Charge for a billable action. Returns `charged: false` when the price list
   * says the action is free — callers must let the action through in that case.
   */
  async charge(input: ChargeInput): Promise<ChargeResult> {
    const companyId =
      'companyId' in input.owner ? input.owner.companyId : undefined;
    const price = await this.resolvePrice(input.reason, companyId);
    if (!price?.enabled) {
      return { charged: false, skipped: 'disabled' };
    }

    const amount = round2(this.priceAmount(price, input));
    if (amount.lessThanOrEqualTo(ZERO)) {
      return { charged: false, skipped: 'free' };
    }

    const wallet = await this.getOrCreateWallet(input.owner);
    if (!input.allowNegative) {
      this.assertNoDebt(wallet);
    }

    const result = await this.move({
      walletId: wallet.id,
      amount: amount.negated(),
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      createdById: input.createdById,
      comment: input.comment,
      leadId: input.leadId,
      offerId: input.offerId,
      requestId: input.requestId,
      allowNegative: input.allowNegative,
    });

    await this.afterBalanceChange(wallet.id, result.balance);

    return {
      charged: true,
      amount,
      balance: result.balance,
      duplicate: result.duplicate,
      transaction: result.transaction,
    };
  }

  /** A wallet in debt cannot buy anything new until it is topped up. */
  assertNoDebt(wallet: Wallet) {
    if (wallet.balance.lessThan(ZERO)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'WALLET_IN_DEBT',
          message: 'Wallet is in debt — top up before spending again',
          balance: wallet.balance.toString(),
          currency: wallet.currency,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  // ----------------------------------------------------------------- prices

  async resolvePrice(
    reason: BillingReason,
    companyId?: string,
  ): Promise<ResolvedPrice | null> {
    if (companyId) {
      const own = await this.prisma.companyPrice.findUnique({
        where: { companyId_reason: { companyId, reason } },
      });
      if (own) {
        return {
          reason,
          enabled: own.enabled,
          amount: own.amount,
          percent: own.percent,
          scope: 'company',
        };
      }
    }

    const platform = await this.prisma.platformPrice.findUnique({
      where: { reason },
    });
    if (!platform) return null;

    return {
      reason,
      enabled: platform.enabled,
      amount: platform.amount,
      percent: platform.percent,
      scope: 'platform',
    };
  }

  async myPricing(userId: string) {
    const { companyId } = await this.ownerForUser(userId);
    const reasons = Object.values(BillingReason);
    const prices = await Promise.all(
      reasons.map((reason) => this.resolvePrice(reason, companyId)),
    );

    return reasons.map((reason, i) => {
      const price = prices[i];
      return {
        reason,
        enabled: price?.enabled ?? false,
        amount: price ? price.amount.toString() : '0',
        percent: price?.percent ? price.percent.toString() : null,
        scope: price?.scope ?? 'platform',
      };
    });
  }

  async listPricing() {
    const [platform, companies] = await Promise.all([
      this.prisma.platformPrice.findMany({ orderBy: { reason: 'asc' } }),
      this.prisma.companyPrice.findMany({
        orderBy: [{ companyId: 'asc' }, { reason: 'asc' }],
        include: { company: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      platform: platform.map((row) => ({
        reason: row.reason,
        enabled: row.enabled,
        amount: row.amount.toString(),
        percent: row.percent ? row.percent.toString() : null,
        currency: row.currency,
      })),
      companies: companies.map((row) => ({
        companyId: row.companyId,
        companyName: row.company.name,
        reason: row.reason,
        enabled: row.enabled,
        amount: row.amount.toString(),
        percent: row.percent ? row.percent.toString() : null,
      })),
    };
  }

  async upsertPricing(
    rules: Array<{
      reason: BillingReason;
      enabled: boolean;
      amount: number;
      percent?: number;
      companyId?: string;
    }>,
  ) {
    for (const rule of rules) {
      const amount = round2(rule.amount);
      const percent = rule.percent === undefined ? null : round2(rule.percent);

      if (rule.companyId) {
        await this.prisma.companyPrice.upsert({
          where: {
            companyId_reason: {
              companyId: rule.companyId,
              reason: rule.reason,
            },
          },
          create: {
            companyId: rule.companyId,
            reason: rule.reason,
            enabled: rule.enabled,
            amount,
            percent,
          },
          update: { enabled: rule.enabled, amount, percent },
        });
      } else {
        await this.prisma.platformPrice.upsert({
          where: { reason: rule.reason },
          create: {
            reason: rule.reason,
            enabled: rule.enabled,
            amount,
            percent,
          },
          update: { enabled: rule.enabled, amount, percent },
        });
      }
    }

    return this.listPricing();
  }

  async listWallets(query: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const q = query.q?.trim();
    const where: Prisma.WalletWhereInput = q
      ? {
          OR: [
            { company: { name: { contains: q, mode: 'insensitive' } } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { fullName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          company: { select: { id: true, name: true, city: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      items: items.map((wallet) => ({
        ...serializeWallet(wallet),
        company: wallet.company,
        user: wallet.user,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ---------------------------------------------------------------- helpers

  private priceAmount(
    price: ResolvedPrice,
    input: ChargeInput,
  ): Prisma.Decimal {
    if (input.amount !== undefined) return new Prisma.Decimal(input.amount);
    if (price.percent && input.base !== undefined) {
      return new Prisma.Decimal(input.base).mul(price.percent).div(100);
    }
    return price.amount;
  }

  /** Warn the owners once a day while the balance sits below the threshold. */
  private async afterBalanceChange(
    walletId: string,
    balance: Prisma.Decimal,
  ): Promise<void> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) return;

    if (!balance.lessThan(this.lowBalanceThreshold)) {
      if (wallet.lowBalanceNotifiedAt) {
        await this.prisma.wallet.update({
          where: { id: walletId },
          data: { lowBalanceNotifiedAt: null },
        });
      }
      return;
    }

    const notifiedAt = wallet.lowBalanceNotifiedAt?.getTime() ?? 0;
    if (Date.now() - notifiedAt < LOW_BALANCE_NOTICE_INTERVAL_MS) return;

    const userIds = await this.walletUserIds(wallet);
    if (!userIds.length) return;

    try {
      await this.notifications.notifyUsers(userIds, {
        type: NotificationType.LOW_BALANCE,
        title: 'Низкий баланс',
        body: `На балансе осталось ${balance.toString()} ${wallet.currency}. Пополните счёт, чтобы продолжить работу.`,
        payload: { walletId, balance: balance.toString() },
      });
      await this.prisma.wallet.update({
        where: { id: walletId },
        data: { lowBalanceNotifiedAt: new Date() },
      });
    } catch (err) {
      // The money already moved; a failed notice must not undo it.
      this.logger.warn(
        `Low balance notice failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async walletUserIds(wallet: Wallet): Promise<string[]> {
    if (wallet.userId) return [wallet.userId];
    if (!wallet.companyId) return [];

    const [company, members] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: wallet.companyId },
        select: { ownerId: true },
      }),
      this.prisma.companyMember.findMany({
        where: { companyId: wallet.companyId },
        select: { userId: true },
      }),
    ]);

    return [
      ...(company ? [company.ownerId] : []),
      ...members.map((member) => member.userId),
    ];
  }
}

function round2(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

/** `amount` is the signed move that was attempted (negative for a charge). */
function insufficientFunds(amount: Prisma.Decimal, wallet: Wallet) {
  return new HttpException(
    {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      error: 'INSUFFICIENT_FUNDS',
      message: 'Not enough funds on the balance',
      required: amount.negated().toString(),
      // The increment already applied inside the transaction being rolled back.
      balance: wallet.balance.sub(amount).toString(),
      currency: wallet.currency,
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

function isRecordNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  );
}

export function serializeWallet(wallet: Wallet) {
  return {
    id: wallet.id,
    companyId: wallet.companyId,
    userId: wallet.userId,
    balance: wallet.balance.toString(),
    currency: wallet.currency,
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function serializeTransaction(
  tx: WalletTransaction & {
    createdBy?: { id: string; fullName: string; email: string } | null;
  },
) {
  return {
    id: tx.id,
    type: tx.type,
    reason: tx.reason,
    amount: tx.amount.toString(),
    balanceAfter: tx.balanceAfter.toString(),
    comment: tx.comment,
    leadId: tx.leadId,
    offerId: tx.offerId,
    requestId: tx.requestId,
    createdBy: tx.createdBy ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
