import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForAcceptedOffer(input: {
    requestId: string;
    buyerId: string;
    supplierUserId: string;
  }) {
    const existing = await this.prisma.conversation.findUnique({
      where: { requestId: input.requestId },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        type: 'REQUEST_CHAT',
        requestId: input.requestId,
        members: {
          create: [
            { userId: input.buyerId },
            { userId: input.supplierUserId },
          ],
        },
      },
    });
  }

  async listMine(userId: string) {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        request: { select: { id: true, code: true, title: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMessages(userId: string, conversationId: string) {
    await this.requireMember(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    await this.requireMember(userId, conversationId);
    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, body },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  }

  private async requireMember(userId: string, conversationId: string) {
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
}
