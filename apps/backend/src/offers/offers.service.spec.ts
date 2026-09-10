import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CompaniesService } from '../companies/companies.service';
import type { ConversationsService } from '../conversations/conversations.service';
import type { DealsService } from '../deals/deals.service';
import type { LeadCrmService } from '../crm/lead-crm.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { OffersService } from './offers.service';

function build() {
  const prisma = {
    request: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    offer: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    lead: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'lead-1' }),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
  const conversations = {
    ensureForAcceptedOffer: jest.fn().mockResolvedValue({ id: 'conv-1' }),
  };
  const companies = {
    resolveCompanyForUser: jest
      .fn()
      .mockResolvedValue({ company: { id: 'c1', name: 'Поставщик' } }),
    listMemberUserIds: jest.fn().mockResolvedValue(['supplier-user']),
  };
  const crm = { logActivity: jest.fn().mockResolvedValue(undefined) };
  const deals = {
    createForAcceptedOffer: jest.fn().mockResolvedValue({ id: 'deal-1' }),
  };

  const service = new OffersService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    conversations as unknown as ConversationsService,
    companies as unknown as CompaniesService,
    crm as unknown as LeadCrmService,
    deals as unknown as DealsService,
  );

  return {
    service,
    prisma,
    notifications,
    conversations,
    companies,
    crm,
    deals,
  };
}

describe('OffersService.create', () => {
  it('требует профиль компании', async () => {
    const { service, companies } = build();
    companies.resolveCompanyForUser.mockResolvedValue(null);

    await expect(
      service.create('u1', { requestId: 'r1', price: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('отклоняет КП по неопубликованной заявке', async () => {
    const { service, prisma } = build();
    prisma.request.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'DRAFT',
      buyerId: 'b1',
    });

    await expect(
      service.create('u1', { requestId: 'r1', price: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('создаёт КП, переводит лид в OFFERED и уведомляет заказчика', async () => {
    const { service, prisma, notifications, crm } = build();
    prisma.request.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'PUBLISHED',
      buyerId: 'b1',
    });
    prisma.offer.create.mockResolvedValue({
      id: 'offer-1',
      company: { name: 'Поставщик' },
    });

    const offer = await service.create('u1', {
      requestId: 'r1',
      price: 450000,
      deliveryDays: 5,
      comment: 'есть на складе',
    });

    expect(offer).toMatchObject({ id: 'offer-1' });
    const [[leadUpdate]] = prisma.lead.updateMany.mock.calls as [
      [{ where: unknown; data: Record<string, unknown> }],
    ];
    expect(leadUpdate.where).toEqual({ requestId: 'r1', companyId: 'c1' });
    expect(leadUpdate.data).toMatchObject({
      status: 'OFFERED',
      assigneeId: 'u1',
    });
    expect(crm.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OFFER_SENT' }),
    );
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['b1'],
      expect.objectContaining({ type: 'NEW_OFFER' }),
    );
  });
});

describe('OffersService.accept', () => {
  const pendingOffer = {
    id: 'offer-1',
    requestId: 'r1',
    companyId: 'c1',
    price: 1200000,
    currency: 'KZT',
    status: 'PENDING',
    request: { id: 'r1', buyerId: 'b1', title: 'Профнастил С8' },
    company: { id: 'c1', ownerId: 'supplier-user' },
  };

  it('404, если КП не найдено', async () => {
    const { service, prisma } = build();
    prisma.offer.findUnique.mockResolvedValue(null);
    await expect(service.accept('b1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403, если принимает не владелец заявки', async () => {
    const { service, prisma } = build();
    prisma.offer.findUnique.mockResolvedValue(pendingOffer);
    await expect(
      service.accept('someone-else', 'offer-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('400, если КП уже не в статусе PENDING', async () => {
    const { service, prisma } = build();
    prisma.offer.findUnique.mockResolvedValue({
      ...pendingOffer,
      status: 'ACCEPTED',
    });
    await expect(service.accept('b1', 'offer-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('принимает КП: остальные отклоняются, заявка IN_PROGRESS, рождаются сделка и чат', async () => {
    const { service, prisma, deals, conversations, notifications } = build();
    prisma.offer.findUnique.mockResolvedValue(pendingOffer);
    prisma.offer.update.mockResolvedValue({});
    prisma.offer.updateMany.mockResolvedValue({ count: 4 });
    // $transaction получает массив «операций» (промисов от замоканных методов)
    prisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );

    const result = await service.accept('b1', 'offer-1');

    expect(result).toEqual({
      offerId: 'offer-1',
      conversationId: 'conv-1',
      dealId: 'deal-1',
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(deals.createForAcceptedOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: 'offer-1',
        requestId: 'r1',
        buyerId: 'b1',
        amount: 1200000,
      }),
    );
    expect(conversations.ensureForAcceptedOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'r1',
        buyerId: 'b1',
        supplierUserIds: ['supplier-user'],
      }),
    );
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['supplier-user'],
      expect.objectContaining({ type: 'OFFER_ACCEPTED' }),
    );
  });
});

describe('OffersService.withdraw', () => {
  it('403, если КП принадлежит другой компании', async () => {
    const { service, prisma, companies } = build();
    companies.resolveCompanyForUser.mockResolvedValue({
      company: { id: 'c1' },
    });
    prisma.offer.findUnique.mockResolvedValue({
      id: 'o1',
      companyId: 'c2',
      status: 'PENDING',
      request: {},
    });

    await expect(service.withdraw('u1', 'o1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('нельзя отозвать уже принятое КП', async () => {
    const { service, prisma } = build();
    prisma.offer.findUnique.mockResolvedValue({
      id: 'o1',
      companyId: 'c1',
      status: 'ACCEPTED',
      request: {},
    });

    await expect(service.withdraw('u1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
