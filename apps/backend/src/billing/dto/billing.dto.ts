import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Either companyId or userId — the wallet owner. */
export class WalletOwnerDto {
  @ApiPropertyOptional({ description: 'Supplier company wallet' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Personal wallet (buyer)' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class TopUpDto extends WalletOwnerDto {
  @ApiProperty({ example: 50000, description: 'Amount in the wallet currency' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: 'Bank transfer #142 of 03.09.2026' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({
    description: 'Repeat-safe key; generated server-side when omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class AdjustDto extends WalletOwnerDto {
  @ApiProperty({ example: -1500, description: 'Signed correction amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @ApiProperty({ example: 'Refund for lead HH-1042 (duplicate)' })
  @IsString()
  @MaxLength(500)
  comment!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class PriceRuleDto {
  @ApiProperty({ enum: BillingReason })
  @IsEnum(BillingReason)
  reason!: BillingReason;

  @ApiProperty({ description: 'Off means the action stays free' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: 2000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({
    example: 2.5,
    description:
      'Percent of the deal — used by DEAL_COMMISSION instead of amount',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({
    description: 'Company-specific price; omit for the platform default',
  })
  @IsOptional()
  @IsString()
  companyId?: string;
}

export class UpdatePricingDto {
  @ApiProperty({ type: [PriceRuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PriceRuleDto)
  rules!: PriceRuleDto[];
}

export class WalletsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by company name or user email' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class TransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BillingReason })
  @IsOptional()
  @IsEnum(BillingReason)
  reason?: BillingReason;
}
