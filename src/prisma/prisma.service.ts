import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { queryLogStore } from '../ops/query-log.store';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
    this.$on('query' as never, ((event: { duration: number; query: string }) => {
      queryLogStore.push(event.duration, event.query);
    }) as never);
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      console.warn(
        '[Prisma] Database connection failed. Set DATABASE_URL and run migrations.',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
