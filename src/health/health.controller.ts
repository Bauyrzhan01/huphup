import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'huphup-backend',
      database,
      dbLatencyMs,
      time: new Date().toISOString(),
    };
  }
}
