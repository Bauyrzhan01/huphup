import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompaniesModule } from '../companies/companies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DealsAdminController } from './deals-admin.controller';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

@Module({
  imports: [BillingModule, CompaniesModule, NotificationsModule],
  controllers: [DealsController, DealsAdminController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
