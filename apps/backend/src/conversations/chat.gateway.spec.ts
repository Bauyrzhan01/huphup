import type { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import type { PrismaService } from '../prisma/prisma.service';
import { ChatEventsService } from './chat-events.service';
import { ChatGateway } from './chat.gateway';

type ChatSocket = Parameters<ChatGateway['handleConnection']>[0];

function fakeSocket(handshake: Record<string, unknown> = {}) {
  const emit = jest.fn();
  return {
    socket: {
      data: {} as { userId?: string; conversationId?: string },
      handshake: { auth: {}, query: {}, headers: {}, ...handshake },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      to: jest.fn().mockReturnValue({ emit }),
    },
    emit,
  };
}

describe('ChatGateway', () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { conversationMember: { findFirst: jest.Mock } };
  let events: ChatEventsService;
  let gateway: ChatGateway;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    prisma = { conversationMember: { findFirst: jest.fn() } };
    events = new ChatEventsService();
    gateway = new ChatGateway(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      events,
    );
  });

  const connect = (client: { socket: unknown }) =>
    gateway.handleConnection(client.socket as ChatSocket);

  it('rejects a handshake without a token', async () => {
    const client = fakeSocket();
    await connect(client);
    expect(client.socket.disconnect).toHaveBeenCalledWith(true);
    expect(client.socket.data.userId).toBeUndefined();
  });

  it('rejects an invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const client = fakeSocket({ auth: { token: 'bad' } });
    await connect(client);
    expect(client.socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('accepts a valid token and joins the personal room', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    const client = fakeSocket({ auth: { token: 'good' } });
    await connect(client);
    expect(client.socket.data.userId).toBe('u1');
    expect(client.socket.join).toHaveBeenCalledWith('user:u1');
    expect(client.socket.disconnect).not.toHaveBeenCalled();
  });

  it('reads the token from the query string too', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u2' });
    const client = fakeSocket({ query: { access_token: 'good' } });
    await connect(client);
    expect(client.socket.data.userId).toBe('u2');
  });

  it('refuses to join a conversation the user is not a member of', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue(null);
    const client = fakeSocket();
    client.socket.data.userId = 'u1';
    const res = await gateway.join(client.socket as unknown as ChatSocket, {
      conversationId: 'c1',
    });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(client.socket.join).not.toHaveBeenCalled();
  });

  it('joins members and leaves the previous room', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'cm1' });
    const client = fakeSocket();
    client.socket.data.userId = 'u1';
    client.socket.data.conversationId = 'c-old';

    const res = await gateway.join(client.socket as unknown as ChatSocket, {
      conversationId: 'c1',
    });

    expect(res).toEqual({ ok: true, conversationId: 'c1' });
    expect(client.socket.leave).toHaveBeenCalledWith('c-old');
    expect(client.socket.join).toHaveBeenCalledWith('c1');
    expect(client.socket.data.conversationId).toBe('c1');
  });

  it('broadcasts published messages into the conversation room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as unknown as Server;
    gateway.onModuleInit();

    events.publish({
      id: 'm1',
      conversationId: 'c1',
      body: 'hi',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      sender: { id: 'u1', fullName: 'Айгуль', role: 'BUYER', avatarUrl: null },
      attachments: [],
    } as unknown as Parameters<ChatEventsService['publish']>[0]);

    expect(to).toHaveBeenCalledWith('c1');
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: 'm1' }),
    );
  });

  it('survives a publish before the socket server is ready', () => {
    gateway.server = undefined as unknown as Server;
    gateway.onModuleInit();
    expect(() =>
      events.publish({
        id: 'm2',
        conversationId: 'c1',
        body: 'hi',
        createdAt: new Date('2026-09-01T10:00:00Z'),
        sender: {
          id: 'u1',
          fullName: 'Айгуль',
          role: 'BUYER',
          avatarUrl: null,
        },
        attachments: [],
      } as unknown as Parameters<ChatEventsService['publish']>[0]),
    ).not.toThrow();
  });

  it('notifies the room when a typing user disconnects', () => {
    const client = fakeSocket();
    client.socket.data.userId = 'u1';
    client.socket.data.conversationId = 'c1';
    gateway.handleDisconnect(client.socket as unknown as ChatSocket);
    expect(client.socket.to).toHaveBeenCalledWith('c1');
    expect(client.emit).toHaveBeenCalledWith('typing', {
      conversationId: 'c1',
      userId: 'u1',
      isTyping: false,
    });
  });
});
