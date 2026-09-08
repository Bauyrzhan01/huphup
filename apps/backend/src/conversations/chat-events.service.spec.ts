import type { Message } from '@prisma/client';
import { ChatEventsService, ChatMessageEvent } from './chat-events.service';

function message(overrides: Partial<Message> = {}) {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    body: 'привет',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
    sender: { id: 'u1', fullName: 'Айгуль', role: 'BUYER', avatarUrl: null },
    attachments: [],
  } as unknown as Parameters<ChatEventsService['publish']>[0];
}

describe('ChatEventsService', () => {
  let events: ChatEventsService;

  beforeEach(() => {
    events = new ChatEventsService();
  });

  it('delivers a published message to SSE subscribers and the gateway', () => {
    const seen: string[] = [];
    const broadcast: ChatMessageEvent[] = [];
    events.setBroadcaster((event) => broadcast.push(event));
    const sub = events.stream('c1').subscribe((e) => seen.push(e.id));

    events.publish(message());

    expect(seen).toEqual(['m1']);
    expect(broadcast).toHaveLength(1);
    expect(broadcast[0]).toMatchObject({
      id: 'm1',
      conversationId: 'c1',
      createdAt: '2026-09-01T10:00:00.000Z',
    });
    sub.unsubscribe();
  });

  it('does not fail the caller when a transport throws', () => {
    events.setBroadcaster(() => {
      throw new Error('socket server is not ready');
    });
    expect(() => events.publish(message())).not.toThrow();
  });

  it('drops the channel once the last subscriber leaves', () => {
    const first = events.stream('c1').subscribe();
    const second = events.stream('c1').subscribe();
    expect(events.channelCount).toBe(1);

    first.unsubscribe();
    expect(events.channelCount).toBe(1);

    second.unsubscribe();
    expect(events.channelCount).toBe(0);
  });

  it('does not allocate a channel for conversations nobody listens to', () => {
    events.publish(message({ conversationId: 'c-unwatched' }));
    expect(events.channelCount).toBe(0);
  });
});
