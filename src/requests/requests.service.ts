import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  ) {}

  analyze(dto: AnalyzeRequestDto) {
    const text = dto.text.toLowerCase();
    let category = 'Товары и материалы';
    let city = 'Алматы';
    let quantity = '—';
    let deadline = 'Уточнить';

    if (text.includes('ремонт') || text.includes('монтаж')) {
      category = 'Работы и услуги';
    }
    if (text.includes('астан')) city = 'Астана';
    if (text.includes('шымкент')) city = 'Шымкент';

    const qtyMatch = dto.text.match(/(\d+[\s]?(?:м²|м2|шт|тонн|т|кг))/i);
    if (qtyMatch) quantity = qtyMatch[1];

    const deadlineMatch = dto.text.match(
      /до\s+(\d{1,2}\s+\S+|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i,
    );
    if (deadlineMatch) deadline = deadlineMatch[1];

    const title =
      dto.text.length > 80 ? `${dto.text.slice(0, 77)}...` : dto.text;

    return {
      title,
      description: dto.text,
      category,
      city,
      quantity,
      deadline,
      rawText: dto.text,
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
              select: { id: true, name: true, city: true, verified: true, rating: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        attachments: true,
        conversation: { select: { id: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.buyerId !== userId && role !== 'ADMIN' && role !== 'SUPPLIER') {
      throw new ForbiddenException('Access denied');
    }
    return request;
  }

  async update(buyerId: string, id: string, dto: UpdateRequestDto) {
    const request = await this.requireOwned(buyerId, id);
    if (request.status === RequestStatus.CLOSED) {
      throw new ForbiddenException('Closed request cannot be edited');
    }
    return this.prisma.request.update({
      where: { id },
      data: dto,
    });
  }

  async publish(buyerId: string, id: string) {
    const request = await this.requireOwned(buyerId, id);
    if (request.status !== RequestStatus.DRAFT && request.status !== RequestStatus.CANCELLED) {
      throw new ForbiddenException('Only draft/cancelled requests can be published');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.PUBLISHED },
    });

    const leads = await this.matching.createLeadsForRequest(updated.id);

    await this.notifications.notifyUsers(
      leads.map((l) => l.ownerId),
      {
        type: 'NEW_LEAD',
        title: 'Новая подходящая заявка',
        body: updated.title,
        payload: { requestId: updated.id, code: updated.code },
      },
    );

    return { request: updated, leadsCreated: leads.length };
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
    const count = await this.prisma.request.count();
    return `HH-${1000 + count + 1}`;
  }
}
