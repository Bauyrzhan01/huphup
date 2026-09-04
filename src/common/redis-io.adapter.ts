import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

const ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * Without it every instance keeps its own room registry, so a chat message
 * produced on instance A never reaches a client connected to instance B.
 * Enabled only when REDIS_URL is set; a failed connection degrades to the
 * in-memory adapter instead of blocking startup.
 */
export class RedisIoAdapter extends IoAdapter {
  private static readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private lastErrorLoggedAt = 0;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string): Promise<boolean> {
    const pubClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    const subClient = pubClient.duplicate();

    // ioredis emits `error` on every reconnect attempt; without a listener
    // Node treats it as an unhandled error event.
    const onError = (err: Error) => this.logRedisError(err);
    pubClient.on('error', onError);
    subClient.on('error', onError);

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      RedisIoAdapter.logger.log('WebSocket scaling enabled via Redis adapter');
      return true;
    } catch (err) {
      RedisIoAdapter.logger.warn(
        `Redis adapter unavailable, falling back to in-memory rooms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      pubClient.disconnect();
      subClient.disconnect();
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  /** Redis retries forever — log at most once per interval so logs stay readable. */
  private logRedisError(err: Error) {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLoggedAt = now;
    RedisIoAdapter.logger.warn(`Redis connection error: ${err.message}`);
  }
}
