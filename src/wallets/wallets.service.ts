import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AdjustBalanceDto } from './dto/wallet.dto';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const wallet = await this.ensureWallet(this.prisma, userId);
    return this.toWalletDto(wallet);
  }

  async listMineTransactions(userId: string, query: PaginationQueryDto) {
    const wallet = await this.ensureWallet(this.prisma, userId);
    return this.listTransactions(wallet.id, query);
  }

  async listAdmin(params: { q?: string; page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const q = params.q?.trim();

    const where: Prisma.WalletWhereInput = q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ],
          },
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      items: items.map((w) => ({
        walletId: w.id,
        userId: w.user.id,
        email: w.user.email,
        fullName: w.user.fullName,
        role: w.user.role,
        balance: this.money(w.balance),
        currency: w.currency,
        updatedAt: w.updatedAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getAdmin(userId: string) {
    await this.assertUserExists(userId);
    const wallet = await this.ensureWallet(this.prisma, userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    return {
      walletId: wallet.id,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      ...this.toWalletDto(wallet),
    };
  }

  async listAdminTransactions(userId: string, query: PaginationQueryDto) {
    await this.assertUserExists(userId);
    const wallet = await this.ensureWallet(this.prisma, userId);
    return this.listTransactions(wallet.id, query);
  }

  async credit(adminId: string, userId: string, dto: AdjustBalanceDto) {
    return this.adjust(adminId, userId, WalletTransactionType.CREDIT, dto);
  }

  async debit(adminId: string, userId: string, dto: AdjustBalanceDto) {
    return this.adjust(adminId, userId, WalletTransactionType.DEBIT, dto);
  }

  private async adjust(
    adminId: string,
    userId: string,
    type: WalletTransactionType,
    dto: AdjustBalanceDto,
  ) {
    await this.assertUserExists(userId);
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(tx, userId);

      if (type === WalletTransactionType.CREDIT) {
        const updated = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        const txn = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type,
            amount,
            balanceAfter: updated.balance,
            comment: dto.comment,
            createdById: adminId,
          },
        });
        return { wallet: updated, txn };
      }

      const changed = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (changed.count === 0) {
        throw new BadRequestException('Insufficient balance');
      }
      const updated = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount,
          balanceAfter: updated.balance,
          comment: dto.comment,
          createdById: adminId,
        },
      });
      return { wallet: updated, txn };
    });

    return {
      ...this.toWalletDto(result.wallet),
      transaction: this.toTxnDto(result.txn),
    };
  }

  private async listTransactions(
    walletId: string,
    query: PaginationQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where: { walletId } }),
    ]);

    return {
      items: items.map((t) => this.toTxnDto(t)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private async ensureWallet(db: DbClient, userId: string) {
    const existing = await db.wallet.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    try {
      return await db.wallet.create({ data: { userId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return db.wallet.findUniqueOrThrow({ where: { userId } });
      }
      throw error;
    }
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private toWalletDto(wallet: { balance: Prisma.Decimal; currency: string }) {
    return {
      balance: this.money(wallet.balance),
      currency: wallet.currency,
    };
  }

  private toTxnDto(txn: {
    id: string;
    type: WalletTransactionType;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    comment: string | null;
    createdAt: Date;
  }) {
    return {
      id: txn.id,
      type: txn.type,
      amount: this.money(txn.amount),
      balanceAfter: this.money(txn.balanceAfter),
      comment: txn.comment,
      createdAt: txn.createdAt,
    };
  }

  private money(value: Prisma.Decimal) {
    return new Prisma.Decimal(value).toFixed(2);
  }
}
