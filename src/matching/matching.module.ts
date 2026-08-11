import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { CompaniesModule } from '../companies/companies.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [CompaniesModule, GeminiModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
