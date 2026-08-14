import { Module, forwardRef } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CompaniesModule } from '../companies/companies.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    NotificationsModule,
    CompaniesModule,
    CrmModule,
    forwardRef(() => ConversationsModule),
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
