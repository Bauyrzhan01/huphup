import { Module, forwardRef } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [
    forwardRef(() => MatchingModule),
    NotificationsModule,
    GeminiModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
