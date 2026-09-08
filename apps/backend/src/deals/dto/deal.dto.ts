import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CancelDealDto {
  @ApiPropertyOptional({ example: 'Поставщик не выходит на связь' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DisputeDealDto {
  @ApiProperty({ example: 'Привезли 8 тонн вместо 10' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class DealsQueryDto {
  @ApiPropertyOptional({ enum: DealStatus })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;
}
