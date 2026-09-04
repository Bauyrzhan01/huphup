import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { AdminWalletsController } from './admin-wallets.controller';

@Module({
  controllers: [WalletsController, AdminWalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
