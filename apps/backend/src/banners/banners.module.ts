import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BannersAdminController } from './banners-admin.controller';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [AuthModule],
  controllers: [BannersController, BannersAdminController],
  providers: [BannersService],
})
export class BannersModule {}
