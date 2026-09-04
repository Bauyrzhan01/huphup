import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Readiness: the API cannot serve anything useful without Postgres, so a
   * dead database answers 503 and platform health checks can act on it.
   */
  @Public()
  @Get()
  async check() {
    let database: 'up' | 'down' = 'down';
    let dbLatencyMs: number | null = null;
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
      dbLatencyMs = Date.now() - started;
    } catch {
      database = 'down';
    }

    const body = {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'huphup-backend',
      database,
      dbLatencyMs,
      ...this.process(),
    };

    if (database === 'down') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  /** Liveness: the process is up. Never touches the database. */
  @Public()
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'huphup-backend',
      ...this.process(),
    };
  }

  private process() {
    return {
      time: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
    };
  }
}
