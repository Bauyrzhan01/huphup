import { Module } from '@nestjs/common';
import { LeadCrmService } from './lead-crm.service';
import { CrmController } from './crm.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CrmController],
  providers: [LeadCrmService],
  exports: [LeadCrmService],
})
export class CrmModule {}
