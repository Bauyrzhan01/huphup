import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { InvitesController } from './invites.controller';

@Module({
  controllers: [CompaniesController, InvitesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
