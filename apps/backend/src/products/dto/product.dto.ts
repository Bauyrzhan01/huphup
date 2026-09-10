import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Гипсокартон Knauf 12.5 мм' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Влагостойкий лист для перегородок' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'м²' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 'Алматы' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Query for the public catalog. Extends pagination so a single `@Query()`
 * covers `q`/`city`/`page`/`limit` — a bare `@Query('q')` alongside
 * `@Query() pagination` trips the global `forbidNonWhitelisted` pipe.
 */
export class ProductCatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Поиск по названию/описанию товара' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ example: 'Алматы' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

export class ProductDraftDto {
  @ApiProperty({
    example: 'гипсокартон кнауф 12.5 остатки со склада, отдам недорого',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  text!: string;
}
