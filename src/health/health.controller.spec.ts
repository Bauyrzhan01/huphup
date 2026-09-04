import { HttpException, HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok while the database answers', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const controller = new HealthController(prisma as unknown as PrismaService);

    const body = await controller.check();

    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
    expect(body.dbLatencyMs).not.toBeNull();
  });

  it('answers 503 when the database is unreachable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).rejects.toBeInstanceOf(HttpException);
    await controller.check().catch((err: HttpException) => {
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(err.getResponse()).toMatchObject({
        status: 'degraded',
        database: 'down',
      });
    });
  });

  it('keeps liveness independent from the database', () => {
    const prisma = { $queryRaw: jest.fn() };
    const controller = new HealthController(prisma as unknown as PrismaService);

    expect(controller.live().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
