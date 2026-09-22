import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { BannersService } from './banners.service';
import { ActiveBannersQueryDto } from './dto/banner.dto';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @ApiOperation({ summary: 'NBO banners currently shown in the app' })
  @Public()
  @Get()
  list(@Query() query: ActiveBannersQueryDto) {
    return this.banners.listActive(query);
  }
}
