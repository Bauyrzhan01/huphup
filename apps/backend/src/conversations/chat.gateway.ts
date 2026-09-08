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
import type { DefaultEventsMap } from 'socket.io';
import { Server, Socket } from 'socket.io';
import { isOriginAllowed, parseCorsOrigins } from '../common/cors';
import { PrismaService } from '../prisma/prisma.service';
import { ChatEventsService, ChatMessageEvent } from './chat-events.service';

type AuthPayload = { sub: string };

type ChatSocketData = {
  userId?: string;
  conversationId?: string;
};

type ChatSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  ChatSocketData
>;

/** Same allow-list as the HTTP layer; read lazily so config is loaded first. */
function checkOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  callback(
    null,
    isOriginAllowed(origin, parseCorsOrigins(process.env.CORS_ORIGINS)),
  );
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: checkOrigin,
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
      // The gateway may not have booted yet (or the adapter failed) — skip
      // rather than break the HTTP request that produced the message.
      this.server?.to(event.conversationId).emit('message:new', event);
    });
  }

  async handleConnection(client: ChatSocket) {
    try {
      const token = readToken(client);
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
      await client.join(`user:${payload.sub}`);
    } catch (err) {
      this.logger.warn(
        `WS auth failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ChatSocket) {
    const userId = client.data.userId;
    const room = client.data.conversationId;
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
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId;
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

    const prev = client.data.conversationId;
    if (prev && prev !== conversationId) {
      await client.leave(prev);
    }

    client.data.conversationId = conversationId;
    await client.join(conversationId);
    return { ok: true, conversationId };
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId =
      body?.conversationId?.trim() || client.data.conversationId;
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
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ) {
    const userId = client.data.userId;
    const conversationId =
      body?.conversationId?.trim() || client.data.conversationId;
    if (!userId || !conversationId) return;

    client.to(conversationId).emit('typing', {
      conversationId,
      userId,
      isTyping: Boolean(body?.isTyping),
    });
  }
}

/** Token from the socket.io auth payload, the query string or an Authorization header. */
function readToken(client: ChatSocket): string | undefined {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token) return auth.token;

  const queryToken = client.handshake.query?.access_token;
  const fromQuery = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  if (fromQuery) return fromQuery;

  return client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
}
