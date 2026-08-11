import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OfferStatus, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CompaniesService } from '../companies/companies.service';
import { CreateOfferDto } from './dto/offer.dto';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly conversations: ConversationsService,
    private readonly companies: CompaniesService,
  ) {}

  async create(userId: string, dto: CreateOfferDto) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      throw new ForbiddenException('Create a company profile first');
    }
    const company = resolved.company;

    const request = await this.prisma.request.findUnique({
      where: { id: dto.requestId },
    });
    if (!request || request.status !== RequestStatus.PUBLISHED) {
      throw new BadRequestException('Request is not open for offers');
    }

    const offer = await this.prisma.offer.create({
      data: {
        requestId: dto.requestId,
        companyId: company.id,
        authorId: userId,
        price: dto.price,
        currency: dto.currency ?? 'KZT',
        deliveryDays: dto.deliveryDays,
        comment: dto.comment,
      },
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
    });

    await this.prisma.lead.updateMany({
      where: { requestId: dto.requestId, companyId: company.id },
      data: { status: 'OFFERED' },
    });

    await this.notifications.notifyUsers([request.buyerId], {
      type: 'NEW_OFFER',
      title: 'Новое предложение',
      body: `${company.name}: ${dto.price} ${dto.currency ?? 'KZT'}`,
      payload: { requestId: request.id, offerId: offer.id },
    });

    return offer;
  }

  async listMineForBuyer(buyerId: string) {
    return this.prisma.offer.findMany({
      where: { request: { buyerId } },
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
        request: {
          select: {
            id: true,
            code: true,
            title: true,
            city: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async listForRequest(requestId: string, userId: string, role: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.buyerId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.offer.findMany({
      where: { requestId },
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
      orderBy: { price: 'asc' },
    });
  }

  async accept(buyerId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { request: true, company: true },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.request.buyerId !== buyerId) {
      throw new ForbiddenException('Not request owner');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Offer is not pending');
    }

    await this.prisma.$transaction([
      this.prisma.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.ACCEPTED },
      }),
      this.prisma.offer.updateMany({
        where: {
          requestId: offer.requestId,
          id: { not: offerId },
          status: OfferStatus.PENDING,
        },
        data: { status: OfferStatus.REJECTED },
      }),
      this.prisma.request.update({
        where: { id: offer.requestId },
        data: { status: RequestStatus.IN_PROGRESS },
      }),
    ]);

    const memberUserIds = await this.companies.listMemberUserIds(
      offer.companyId,
    );
    const supplierUserIds =
      memberUserIds.length > 0 ? memberUserIds : [offer.company.ownerId];

    const chat = await this.conversations.ensureForAcceptedOffer({
      requestId: offer.requestId,
      buyerId,
      supplierUserIds,
    });

    await this.notifications.notifyUsers(supplierUserIds, {
      type: 'OFFER_ACCEPTED',
      title: 'Ваше предложение принято',
      body: offer.request.title,
      payload: { requestId: offer.requestId, offerId, conversationId: chat.id },
    });

    return { offerId, conversationId: chat.id };
  }

  async reject(buyerId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { request: true },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.request.buyerId !== buyerId) {
      throw new ForbiddenException('Not request owner');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Offer is not pending');
    }
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.REJECTED },
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
    });
  }

  async withdraw(userId: string, offerId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      throw new ForbiddenException('Create a company profile first');
    }
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { request: true },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.companyId !== resolved.company.id) {
      throw new ForbiddenException('Not your offer');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Offer is not pending');
    }
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.WITHDRAWN },
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
        request: {
          select: {
            id: true,
            code: true,
            title: true,
            city: true,
            status: true,
          },
        },
      },
    });
  }

  async listForCompany(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      return [];
    }
    return this.prisma.offer.findMany({
      where: { companyId: resolved.company.id },
      include: {
        request: {
          select: {
            id: true,
            code: true,
            title: true,
            city: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }
}
