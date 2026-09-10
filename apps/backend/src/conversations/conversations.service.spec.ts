import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ChatEventsService } from './chat-events.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ConversationsService } from './conversations.service';

function build() {
  const prisma = {
    conversation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    conversationMember: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    message: { create: jest.fn() },
  };
  const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
  const chatEvents = { publish: jest.fn() };
  const storage = { upload: jest.fn() };

  const service = new ConversationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    chatEvents as unknown as ChatEventsService,
    storage as unknown as StorageService,
  );
  return { service, prisma, notifications, chatEvents };
}

describe('ConversationsService.ensureForAcceptedOffer', () => {
  it('создаёт чат заявки с покупателем и поставщиками, если его ещё нет', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });

    const conv = await service.ensureForAcceptedOffer({
      requestId: 'r1',
      buyerId: 'b1',
      supplierUserIds: ['s1', 's2', 's1'],
    });

    expect(conv).toEqual({ id: 'conv-new' });
    type CreateArg = {
      data: {
        type: string;
        requestId: string;
        members: { create: { userId: string }[] };
      };
    };
    const [[{ data }]] = prisma.conversation.create.mock.calls as [[CreateArg]];
    expect(data).toMatchObject({ type: 'REQUEST_CHAT', requestId: 'r1' });
    const memberIds = data.members.create.map((m) => m.userId);
    expect(memberIds).toEqual(['b1', 's1', 's2']); // дедуп + без самоповтора покупателя
  });

  it('переиспользует существующий чат и добирает недостающих участников', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' });

    const conv = await service.ensureForAcceptedOffer({
      requestId: 'r1',
      buyerId: 'b1',
      supplierUserIds: ['s1'],
    });

    expect(conv).toEqual({ id: 'conv-1' });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversationMember.upsert).toHaveBeenCalledTimes(2); // b1 + s1
  });
});

describe('ConversationsService.sendMessage', () => {
  it('пустое сообщение отклоняется', async () => {
    const { service } = build();
    await expect(
      service.sendMessage('u1', 'conv-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не участник чата не может писать', async () => {
    const { service, prisma } = build();
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' });

    await expect(
      service.sendMessage('outsider', 'conv-1', 'привет'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('несуществующий чат — 404', async () => {
    const { service, prisma } = build();
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    prisma.conversation.findUnique.mockResolvedValue(null);

    await expect(
      service.sendMessage('u1', 'nope', 'привет'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('участник отправляет сообщение: оно создаётся, событие публикуется, другие получают уведомление', async () => {
    const { service, prisma, chatEvents, notifications } = build();
    prisma.conversationMember.findUnique.mockResolvedValue({
      conversationId: 'conv-1',
      userId: 'u1',
    });
    prisma.message.create.mockResolvedValue({ id: 'm1', body: 'привет' });
    prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.conversation.findUnique.mockResolvedValue({
      request: { code: 'HH-1', title: 'Заявка' },
    });

    const msg = await service.sendMessage('u1', 'conv-1', '  привет  ');

    expect(msg).toMatchObject({ id: 'm1' });
    const [[created]] = prisma.message.create.mock.calls as [
      [{ data: { body: string } }],
    ];
    expect(created.data.body).toBe('привет');
    expect(chatEvents.publish).toHaveBeenCalledWith({
      id: 'm1',
      body: 'привет',
    });
    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u2'],
      expect.objectContaining({ type: 'NEW_MESSAGE' }),
    );
  });
});
