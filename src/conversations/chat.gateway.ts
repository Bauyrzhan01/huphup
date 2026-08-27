import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChatEventsService,
  ChatMessageEvent,
} from './chat-events.service';

type AuthPayload = { sub: string };

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
  ) {}

  onModuleInit() {
    this.events.setBroadcaster((event: ChatMessageEvent) => {
      this.server.to(event.conversationId).emit('message:new', event);
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.access_token as string | undefined) ||
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<AuthPayload>(token);
      if (!payload?.sub) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch (err) {
      this.logger.warn(`WS auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    const room = client.data.conversationId as string | undefined;
    if (userId && room) {
      client.to(room).emit('typing', {
        conversationId: room,
        userId,
        isTyping: false,
      });
    }
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    const conversationId = body?.conversationId?.trim();
    if (!userId || !conversationId) {
      return { ok: false, error: 'unauthorized' };
    }

    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, error: 'forbidden' };
    }

    const prev = client.data.conversationId as string | undefined;
    if (prev && prev !== conversationId) {
      client.leave(prev);
    }

    client.data.conversationId = conversationId;
    await client.join(conversationId);
    return { ok: true, conversationId };
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId =
      body?.conversationId?.trim() ||
      (client.data.conversationId as string | undefined);
    if (conversationId) {
      await client.leave(conversationId);
      if (client.data.conversationId === conversationId) {
        client.data.conversationId = undefined;
      }
    }
    return { ok: true };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    const conversationId =
      body?.conversationId?.trim() ||
      (client.data.conversationId as string | undefined);
    if (!userId || !conversationId) return;

    client.to(conversationId).emit('typing', {
      conversationId,
      userId,
      isTyping: Boolean(body?.isTyping),
    });
  }
}
