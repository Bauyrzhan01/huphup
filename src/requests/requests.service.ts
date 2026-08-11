import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeminiService } from '../gemini/gemini.service';
import {
  AnalyzeRequestDto,
  CreateRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
    private readonly gemini: GeminiService,
  ) {}

  async analyze(dto: AnalyzeRequestDto) {
    const geminiResult = await this.gemini.analyzeRequest(dto.text);
    if (geminiResult) {
      return geminiResult;
    }
    return this.analyzeFallback(dto.text);
  }

  private analyzeFallback(text: string) {
    const lower = text.toLowerCase();
    let category = 'Товары и материалы';
    let city = 'Алматы';
    let quantity = '—';
    let deadline = 'Уточнить';

    if (lower.includes('ремонт') || lower.includes('монтаж')) {
      category = 'Работы и услуги';
    }
    if (lower.includes('астан')) city = 'Астана';
    if (lower.includes('шымкент')) city = 'Шымкент';

    const qtyMatch = text.match(/(\d+[\s]?(?:м²|м2|шт|тонн|т|кг))/i);
    if (qtyMatch) quantity = qtyMatch[1];

    const deadlineMatch = text.match(
      /до\s+(\d{1,2}\s+\S+|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i,
    );
    if (deadlineMatch) deadline = deadlineMatch[1];

    const title = text.length > 80 ? `${text.slice(0, 77)}...` : text;

    return {
      title,
      description: text,
      category,
      city,
      quantity,
      deadline,
      rawText: text,
    };
  }

  async create(buyerId: string, dto: CreateRequestDto) {
    const code = await this.nextCode();
    return this.prisma.request.create({
      data: {
        code,
        buyerId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        city: dto.city,
        quantity: dto.quantity,
        deadline: dto.deadline,
        budgetMin: dto.budgetMin,
        budgetMax: dto.budgetMax,
        rawText: dto.rawText,
        status: RequestStatus.DRAFT,
      },
    });
  }

  async listMine(buyerId: string) {
    return this.prisma.request.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { offers: true, leads: true } },
      },
    });
  }

  async getById(id: string, userId: string, role: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        buyer: { select: { id: true, fullName: true, email: true } },
        offers: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                city: true,
                verified: true,
                rating: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        attachments: true,
        conversation: { select: { id: true } },
        leads: {
          include: {
            company: {
              select: { id: true, name: true, city: true, verified: true },
            },
          },
          orderBy: { score: 'desc' },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.buyerId !== userId && role !== 'ADMIN') {
      if (request.status !== 'PUBLISHED' && request.status !== 'IN_PROGRESS') {
        throw new ForbiddenException('Access denied');
      }
    }
    return request;
  }

  async update(buyerId: string, id: string, dto: UpdateRequestDto) {
    const request = await this.requireOwned(buyerId, id);
    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.CANCELLED
    ) {
      throw new ForbiddenException('Only draft or cancelled requests can be edited');
    }
    return this.prisma.request.update({
      where: { id },
      data: dto,
    });
  }

  async cancel(buyerId: string, id: string) {
    const request = await this.requireOwned(buyerId, id);
    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.PUBLISHED
    ) {
      throw new ForbiddenException('Only draft or published requests can be cancelled');
    }
    return this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED },
    });
  }

  async close(buyerId: string, id: string) {
    const request = await this.requireOwned(buyerId, id);
    if (
      request.status !== RequestStatus.PUBLISHED &&
      request.status !== RequestStatus.IN_PROGRESS
    ) {
      throw new ForbiddenException(
        'Only published or in-progress requests can be closed',
      );
    }
    return this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.CLOSED },
    });
  }

  async publish(buyerId: string, id: string) {
    const request = await this.requireOwned(buyerId, id);
    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.CANCELLED
    ) {
      throw new ForbiddenException('Only draft/cancelled requests can be published');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.PUBLISHED },
    });

    const leads = await this.matching.createLeadsForRequest(updated.id);

    const notifyUserIds = [
      ...new Set(leads.flatMap((l) => l.memberUserIds)),
    ];

    await this.notifications.notifyUsers(notifyUserIds, {
      type: 'NEW_LEAD',
      title: 'Новая подходящая заявка',
      body: updated.title,
      payload: { requestId: updated.id, code: updated.code },
    });

    const companyIds = leads.map((l) => l.companyId);
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
    const companyById = new Map(companies.map((c) => [c.id, c]));

    return {
      request: updated,
      leadsCreated: leads.length,
      matchedSuppliers: leads.map((l) => ({
        companyId: l.companyId,
        companyName: companyById.get(l.companyId)?.name ?? l.companyId,
        city: companyById.get(l.companyId)?.city ?? null,
        score: l.score,
        reason: l.reason,
        productId: l.productId,
      })),
    };
  }

  private async requireOwned(buyerId: string, id: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.buyerId !== buyerId) {
      throw new ForbiddenException('Not request owner');
    }
    return request;
  }

  private async nextCode() {
    const rows = await this.prisma.request.findMany({
      select: { code: true },
      take: 5000,
    });
    let max = 1000;
    for (const row of rows) {
      const match = row.code.match(/(\d+)\s*$/);
      if (!match) continue;
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `HH-${max + 1}`;
  }
}
