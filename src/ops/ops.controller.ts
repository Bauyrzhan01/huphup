import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { OpsService } from './ops.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('ops')
export class OpsController {
  constructor(
    private readonly ops: OpsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('snapshot')
  async snapshot(@Headers('x-monitor-secret') secret?: string) {
    const expected = this.config.get<string>('MONITOR_SECRET')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException('Monitor is not configured');
    }
    if (!secret || !safeEqual(secret, expected)) {
      throw new UnauthorizedException('Bad monitor secret');
    }
    return this.ops.snapshot();
  }
}

function safeEqual(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
