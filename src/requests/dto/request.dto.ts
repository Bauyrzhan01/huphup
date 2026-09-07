import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Both endpoints are public and rate-limited, not authenticated — these caps
// are the only thing standing between an anonymous caller and an unbounded
// Gemini bill. Keep them in sync with the 4000-char per-turn slice in
// GeminiService.generateChatJson.
const MAX_TEXT_LEN = 4000;
const MAX_ANSWER_LEN = 500;
const MAX_MESSAGE_LEN = 4000;
const MAX_ANSWERS = 20;
const MAX_MESSAGES = 60;

export class AnalyzeRequestDto {
  @ApiProperty({
    example: 'Нужно 500 м² брусчатки в Алматы с доставкой до 20 августа',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_TEXT_LEN)
  text!: string;
}

export class ClarifyAnswerDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  @ApiProperty({ example: 'М400' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ANSWER_LEN)
  answer!: string;
}

export class ClarifyRequestDto {
  @ApiProperty({
    example: 'Нужен цемент М400 10 тонн в Алматы и шкафы для спальни 4 штуки',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_TEXT_LEN)
  text!: string;

  @ApiProperty({ type: [ClarifyAnswerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ANSWERS)
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
  @ArrayMaxSize(MAX_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => ClarifyMessageDto)
  messages?: ClarifyMessageDto[];
}

export class ClarifyMessageDto {
  @ApiProperty({ example: 'user', enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_MESSAGE_LEN)
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
