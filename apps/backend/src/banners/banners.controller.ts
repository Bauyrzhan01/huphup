import { Controller, Get, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { BannersService } from './banners.service';
import { ActiveBannersQueryDto } from './dto/banner.dto';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(
    private readonly banners: BannersService,
    private readonly jwt: JwtService,
  ) {}

  @ApiOperation({ summary: 'NBO banners currently shown in the app' })
  @Public()
  @Get()
  async list(@Query() query: ActiveBannersQueryDto, @Req() req: Request) {
    return this.banners.listActive(query, await this.viewerEmail(req));
  }

  /**
   * The endpoint stays public — guests see the live banners. A token, when the
   * app sends one, only decides whether banners under test are visible too.
   */
  private async viewerEmail(req: Request) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ email?: string }>(
        header.slice('Bearer '.length),
      );
      return payload.email?.toLowerCase();
    } catch {
      return undefined;
    }
  }
}
