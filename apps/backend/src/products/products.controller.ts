import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  ProductDraftDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CreateProductReviewDto } from './dto/review.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import { Roles } from '../common/decorators/roles.decorator';
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
  @Get('catalog/meta')
  catalogMeta() {
    return this.productsService.directoryMeta();
  }

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

  @Post('ai-draft')
  @SupplierMember()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  aiDraft(@CurrentUser() user: AuthUser, @Body() dto: ProductDraftDto) {
    return this.productsService.aiDraft(user.id, dto);
  }

  @Public()
  @Get(':id/reviews')
  listReviews(@Param('id') id: string) {
    return this.productsService.listReviews(id);
  }

  @Post(':id/reviews')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  @ApiBearerAuth()
  addReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateProductReviewDto,
  ) {
    return this.productsService.upsertReview(user.id, id, dto);
  }

  @Post(':id/images')
  @SupplierMember()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.productsService.uploadImage(user.id, id, file);
  }

  @Delete(':id/images/:imageId')
  @SupplierMember()
  @ApiBearerAuth()
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.removeImage(user.id, id, imageId);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.productsService.getPublicById(id);
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
