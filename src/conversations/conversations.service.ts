import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatEventsService } from './chat-events.service';
import { MessagesQueryDto } from '../common/dto/pagination.dto';
import { StorageService } from '../storage/storage.service';

const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function guessMimeType(reported: string | undefined, fileName: string) {
  if (reported && reported !== 'application/octet-stream') return reported;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] || reported || 'application/octet-stream';
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatEvents: ChatEventsService,
    private readonly storage: StorageService,
  ) {}

  private readonly messageInclude = {
    sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
    attachments: {
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' as const },
    },
  } as const;

  async ensureForAcceptedOffer(input: {
    requestId: string;
    buyerId: string;
    supplierUserIds: string[];
  }) {
    const existing = await this.prisma.conversation.findUnique({
      where: { requestId: input.requestId },
    });
    if (existing) {
      for (const userId of [input.buyerId, ...input.supplierUserIds]) {
        await this.prisma.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: existing.id,
              userId,
            },
          },
          create: { conversationId: existing.id, userId },
          update: {},
        });
      }
      return existing;
    }

    const uniqueSupplierIds = [...new Set(input.supplierUserIds)];
    return this.prisma.conversation.create({
      data: {
        type: 'REQUEST_CHAT',
        requestId: input.requestId,
        members: {
          create: [
            { userId: input.buyerId },
            ...uniqueSupplierIds
              .filter((id) => id !== input.buyerId)
              .map((userId) => ({ userId })),
          ],
        },
      },
    });
  }

  async listMine(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        request: { select: { id: true, code: true, title: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                role: true,
                avatarUrl: true,
                company: { select: { id: true, name: true } },
                companyMembers: {
                  take: 1,
                  include: { company: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map(({ members, ...c }) => ({
      ...c,
      participants: members.map((m) => ({
        id: m.user.id,
        fullName: m.user.fullName,
        role: m.user.role,
        avatarUrl: m.user.avatarUrl,
        companyName:
          m.user.company?.name ??
          m.user.companyMembers[0]?.company.name ??
          null,
      })),
    }));
  }

  async getMessages(
    userId: string,
    conversationId: string,
    query: MessagesQueryDto = {},
  ) {
    await this.requireMember(userId, conversationId);
    const limit = query.limit ?? 50;

    const cursorMsg = query.after
      ? await this.prisma.message.findUnique({ where: { id: query.after } })
      : query.before
        ? await this.prisma.message.findUnique({ where: { id: query.before } })
        : null;

    const where: {
      conversationId: string;
      createdAt?: { gt?: Date; lt?: Date };
    } = { conversationId };

    if (cursorMsg && query.after) {
      where.createdAt = { gt: cursorMsg.createdAt };
    }
    if (cursorMsg && query.before) {
      where.createdAt = { lt: cursorMsg.createdAt };
    }

    const orderBy = query.before
      ? ({ createdAt: 'desc' as const })
      : ({ createdAt: 'asc' as const });

    const rows = await this.prisma.message.findMany({
      where,
      orderBy,
      take: limit + 1,
      include: this.messageInclude,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const ordered = query.before ? [...items].reverse() : items;
    const nextCursor = hasMore ? ordered[ordered.length - 1]?.id ?? null : null;

    return { items: ordered, hasMore, nextCursor };
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new BadRequestException('Message body is required');
    }
    return this.createMessage(userId, conversationId, {
      body: trimmed,
    });
  }

  async sendMessageWithFile(
    userId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
    body?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > MAX_CHAT_FILE_BYTES) {
      throw new BadRequestException('File exceeds 10 MB limit');
    }

    const mimeType = guessMimeType(file.mimetype, file.originalname);

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType,
      folder: `chat/${conversationId}`,
    });

    return this.createMessage(userId, conversationId, {
      body: body?.trim() ?? '',
      attachment: {
        fileName: file.originalname,
        fileUrl: uploaded.url,
        storageKey: uploaded.key,
        mimeType,
        sizeBytes: file.size,
      },
    });
  }

  private async createMessage(
    userId: string,
    conversationId: string,
    input: {
      body: string;
      attachment?: {
        fileName: string;
        fileUrl: string;
        storageKey: string;
        mimeType?: string;
        sizeBytes?: number;
      };
    },
  ) {
    await this.requireMember(userId, conversationId);
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: input.body,
        ...(input.attachment
          ? {
              attachments: {
                create: {
                  fileName: input.attachment.fileName,
                  fileUrl: input.attachment.fileUrl,
                  storageKey: input.attachment.storageKey,
                  mimeType: input.attachment.mimeType,
                  sizeBytes: input.attachment.sizeBytes,
                },
              },
            }
          : {}),
      },
      include: this.messageInclude,
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    this.chatEvents.publish(message);

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { request: { select: { code: true, title: true } } },
    });
    const preview = input.attachment
      ? `📎 ${input.attachment.fileName}`
      : input.body.slice(0, 140);
    await this.notifications.notifyUsers(
      members.map((m) => m.userId),
      {
        type: 'NEW_MESSAGE',
        title: 'Новое сообщение',
        body: preview,
        payload: {
          conversationId,
          requestCode: conversation?.request?.code,
          requestTitle: conversation?.request?.title,
        },
      },
    );

    return message;
  }

  async requireMember(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!member) {
      const exists = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!exists) {
        throw new NotFoundException('Conversation not found');
      }
      throw new ForbiddenException('Not a conversation member');
    }
  }

  streamMessages(conversationId: string) {
    return this.chatEvents.stream(conversationId);
  }
}
