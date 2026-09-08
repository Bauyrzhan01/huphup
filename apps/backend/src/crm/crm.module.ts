import { Module } from '@nestjs/common';
import { LeadCrmService } from './lead-crm.service';
import { CrmController } from './crm.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [NotificationsModule, CompaniesModule],
  controllers: [CrmController],
  providers: [LeadCrmService],
  exports: [LeadCrmService],
})
export class CrmModule {}
