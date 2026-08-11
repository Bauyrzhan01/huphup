import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get('catalog')
  catalog(
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query() pagination?: PaginationQueryDto,
  ) {
    return this.productsService.listPublicCatalog({
      q,
      city,
      page: pagination?.page,
      limit: pagination?.limit,
    });
  }

  @Get('mine')
  @SupplierMember()
  @ApiBearerAuth()
  listMine(@CurrentUser() user: AuthUser) {
    return this.productsService.listMine(user.id);
  }

  @Post()
  @SupplierMember()
  @ApiBearerAuth()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.id, dto);
  }

  @Patch(':id')
  @SupplierMember()
  @ApiBearerAuth()
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @SupplierMember()
  @ApiBearerAuth()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(user.id, id);
  }
}
