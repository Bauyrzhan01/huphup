import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      // Allow API boot before remote DB is ready; /health reports DB status.
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
