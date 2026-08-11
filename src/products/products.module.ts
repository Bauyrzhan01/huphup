import { Module, forwardRef } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CompaniesModule } from '../companies/companies.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [forwardRef(() => CompaniesModule), StorageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
