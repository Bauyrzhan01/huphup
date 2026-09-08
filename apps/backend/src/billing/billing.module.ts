import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingAdminController } from './billing-admin.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [CompaniesModule, NotificationsModule],
  controllers: [BillingController, BillingAdminController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
