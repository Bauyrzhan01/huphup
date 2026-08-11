import { forwardRef, Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { InvitesController } from './invites.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [forwardRef(() => ProductsModule)],
  controllers: [CompaniesController, InvitesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
