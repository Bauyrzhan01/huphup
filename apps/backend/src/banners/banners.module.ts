import { Module } from '@nestjs/common';
import { BannersAdminController } from './banners-admin.controller';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  controllers: [BannersController, BannersAdminController],
  providers: [BannersService],
})
export class BannersModule {}
