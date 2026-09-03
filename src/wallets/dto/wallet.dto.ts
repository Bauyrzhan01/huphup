import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AdjustBalanceDto {
  @ApiProperty({ example: 15000, description: 'Positive amount in KZT' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  amount!: number;

  @ApiPropertyOptional({ example: 'Manual top-up' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class AdminWalletsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by email or name' })
  @IsOptional()
  @IsString()
  q?: string;
}
