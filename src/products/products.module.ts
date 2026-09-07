import { Module, forwardRef } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CompaniesModule } from '../companies/companies.module';
import { GeminiModule } from '../gemini/gemini.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [forwardRef(() => CompaniesModule), GeminiModule, StorageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
