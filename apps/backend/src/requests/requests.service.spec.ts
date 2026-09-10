import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GeminiService } from '../gemini/gemini.service';
import type { MatchingService } from '../matching/matching.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from './requests.service';

function build() {
  const prisma = {
    request: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const matching = {
    createLeadsForRequest: jest.fn().mockResolvedValue([]),
  };
  const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
  const gemini = {
    analyzeRequest: jest.fn().mockResolvedValue(null), // «Gemini выключен»
    clarifyRequest: jest.fn().mockResolvedValue(null),
  };

  const service = new RequestsService(
    prisma as unknown as PrismaService,
    matching as unknown as MatchingService,
    notifications as unknown as NotificationsService,
    gemini as unknown as GeminiService,
  );
  return { service, prisma, matching, notifications, gemini };
}

describe('RequestsService.publish', () => {
  it('404, если заявки нет или она скрыта', async () => {
    const { service, prisma } = build();
    prisma.request.findUnique.mockResolvedValue(null);
    await expect(service.publish('b1', 'r1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403, если публикует не владелец', async () => {
    const { service, prisma } = build();
    prisma.request.findUnique.mockResolvedValue({
      id: 'r1',
      buyerId: 'other',
      status: 'DRAFT',
    });
    await expect(service.publish('b1', 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403, если заявка не в статусе DRAFT/CANCELLED', async () => {
    const { service, prisma } = build();
    prisma.request.findUnique.mockResolvedValue({
      id: 'r1',
      buyerId: 'b1',
      status: 'PUBLISHED',
    });
    await expect(service.publish('b1', 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('публикует черновик, запускает подбор и уведомляет подобранных поставщиков', async () => {
    const { service, prisma, matching, notifications } = build();
    prisma.request.findUnique.mockResolvedValue({
      id: 'r1',
      buyerId: 'b1',
      status: 'DRAFT',
    });
    prisma.request.update.mockResolvedValue({
      id: 'r1',
      code: 'HH-1042',
      title: 'Профнастил С8',
      status: 'PUBLISHED',
    });
    matching.createLeadsForRequest.mockResolvedValue([
      {
        leadId: 'l1',
        companyId: 'c1',
        memberUserIds: ['u1', 'u2'],
        score: 100,
        reason: 'keyword',
      },
      {
        leadId: 'l2',
        companyId: 'c2',
        memberUserIds: ['u3'],
        score: 90,
        reason: 'keyword',
      },
    ]);
    prisma.company.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'СтройМеталл',
        city: 'Алматы',
        logoUrl: null,
        owner: { avatarUrl: null },
      },
      {
        id: 'c2',
        name: 'КровляПро',
        city: 'Алматы',
        logoUrl: null,
        owner: { avatarUrl: null },
      },
    ]);

    const res = await service.publish('b1', 'r1');

    expect(prisma.request.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: { status: 'PUBLISHED' },
      }),
    );
    expect(matching.createLeadsForRequest).toHaveBeenCalledWith('r1');
    expect(res.leadsCreated).toBe(2);
    expect(res.matchedSuppliers.map((s) => s.companyName)).toEqual([
      'СтройМеталл',
      'КровляПро',
    ]);
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u1', 'u2', 'u3'],
      expect.objectContaining({ type: 'NEW_LEAD' }),
    );
  });
});

describe('RequestsService.create', () => {
  it('присваивает следующий код HH-<n+1> по максимуму существующих', async () => {
    const { service, prisma } = build();
    prisma.request.findMany.mockResolvedValue([
      { code: 'HH-1003' },
      { code: 'HH-1041' },
      { code: 'HH-1007' },
    ]);
    prisma.request.create.mockImplementation(
      ({ data }: { data: { code: string } }) =>
        Promise.resolve({ id: 'r-new', ...data }),
    );

    const created = await service.create('b1', {
      title: 'Профнастил С8',
      description: 'нужен профнастил С8 оцинкованный, 500 листов',
    });

    expect(created.code).toBe('HH-1042');
    expect(created.status).toBe('DRAFT');
    expect(created.buyerId).toBe('b1');
  });
});

describe('RequestsService.analyze (fallback без Gemini)', () => {
  it('вытаскивает количество и срок из свободного текста', async () => {
    const { service } = build();

    const res = await service.analyze({
      text: 'Нужно 500 м² профнастила в Алматы с доставкой до 20 августа',
    });

    expect(res.quantity).toBe('500 м²');
    expect(res.deadline).toContain('20');
    expect(res.rawText).toContain('профнастил');
  });

  it('приветствие не считается товаром', async () => {
    const { service } = build();
    const res = await service.analyze({ text: 'привет' });
    expect(res.title).toBe('');
    expect(res.ready).toBe(false);
  });
});
