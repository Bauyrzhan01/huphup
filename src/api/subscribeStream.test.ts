import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload?: unknown) => void;

const handlers = new Map<string, Handler>();
const socket = {
  connected: false,
  on: vi.fn((event: string, cb: Handler) => {
    handlers.set(event, cb);
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

import { conversationsApi } from './index';

const fire = (event: string, payload?: unknown) => {
  const handler = handlers.get(event);
  if (!handler) throw new Error(`нет обработчика на "${event}"`);
  handler(payload);
};

const openSse = () => FakeEventSource.instances.filter((es) => !es.closed);

describe('conversationsApi.subscribeStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    FakeEventSource.instances = [];
    socket.connected = false;
    localStorage.setItem('huphup_token', 'token-123');
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('без токена не открывает ни одного канала', () => {
    localStorage.clear();
    const stop = conversationsApi.subscribeStream('c1', () => {});

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(socket.on).not.toHaveBeenCalled();
    stop();
  });

  it('входит в комнату, когда сокет подключился', () => {
    const stop = conversationsApi.subscribeStream('c1', () => {});
    fire('connect');

    expect(socket.emit).toHaveBeenCalledWith('join', { conversationId: 'c1' });
    stop();
  });

  it('поднимает SSE, если сокет не подключился за 2.5 секунды', () => {
    const stop = conversationsApi.subscribeStream('c1', () => {});
    expect(openSse()).toHaveLength(0);

    vi.advanceTimersByTime(2500);

    expect(openSse()).toHaveLength(1);
    expect(openSse()[0].url).toContain('/conversations/c1/stream');
    stop();
  });

  it('закрывает SSE, как только сокет ожил — два канала одновременно не живут', () => {
    const stop = conversationsApi.subscribeStream('c1', () => {});

    fire('connect_error');
    expect(openSse()).toHaveLength(1);

    fire('connect');
    expect(openSse()).toHaveLength(0);

    // И запасной таймер больше не поднимет второй канал.
    vi.advanceTimersByTime(5000);
    expect(openSse()).toHaveLength(0);
    stop();
  });

  it('после нового обрыва запасной канал поднимается снова', () => {
    const stop = conversationsApi.subscribeStream('c1', () => {});

    fire('connect_error');
    fire('connect');
    expect(openSse()).toHaveLength(0);

    fire('connect_error');
    expect(openSse()).toHaveLength(1);
    stop();
  });

  it('сообщения из сокета доходят до подписчика', () => {
    const received: string[] = [];
    const stop = conversationsApi.subscribeStream('c1', (msg) =>
      received.push(msg.id),
    );

    fire('message:new', { id: 'm1' });

    expect(received).toEqual(['m1']);
    stop();
  });

  it('отписка гасит и сокет, и SSE', () => {
    const stop = conversationsApi.subscribeStream('c1', () => {});
    fire('connect_error');
    expect(openSse()).toHaveLength(1);

    stop();

    expect(socket.emit).toHaveBeenCalledWith('leave', { conversationId: 'c1' });
    expect(socket.disconnect).toHaveBeenCalled();
    expect(openSse()).toHaveLength(0);
  });
});
