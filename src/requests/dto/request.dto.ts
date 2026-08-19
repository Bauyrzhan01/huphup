import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AnalyzeRequestDto {
  @ApiProperty({
    example:
      'Нужно 500 м² брусчатки в Алматы с доставкой до 20 августа',
  })
  @IsString()
  @MinLength(2)
  text!: string;
}

export class ClarifyAnswerDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({ example: 'М400' })
  @IsString()
  @MinLength(1)
  answer!: string;
}

export class ClarifyRequestDto {
  @ApiProperty({
    example: 'Нужен цемент М400 10 тонн в Алматы и шкафы для спальни 4 штуки',
  })
  @IsString()
  @MinLength(2)
  text!: string;

  @ApiProperty({ type: [ClarifyAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClarifyAnswerDto)
  answers!: ClarifyAnswerDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  previous?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClarifyMessageDto)
  messages?: ClarifyMessageDto[];
}

export class ClarifyMessageDto {
  @ApiProperty({ example: 'user' })
  @IsString()
  role!: string;

  @ApiProperty()
  @IsString()
  content!: string;
}

export class CreateRequestDto {
  @ApiProperty({ example: 'Брусчатка 500 м² в Алматы' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Алматы' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '500 м²' })
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rawText?: string;
}

export class UpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budgetMax?: number;
}

export class FavoriteRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

export class DirectRequestDto {
  @ApiProperty({ example: 'clxyz...' })
  @IsString()
  @MinLength(1)
  productId!: string;

  @ApiProperty({ example: '20 т' })
  @IsString()
  @MinLength(1)
  quantity!: string;

  @ApiProperty({ example: 'до 10 дней' })
  @IsString()
  @MinLength(1)
  deadline!: string;
}
