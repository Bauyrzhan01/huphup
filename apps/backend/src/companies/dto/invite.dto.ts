import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyMemberRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'manager@company.kz' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: [CompanyMemberRole.MANAGER] })
  @IsOptional()
  @IsEnum(CompanyMemberRole)
  role?: CompanyMemberRole;

  @ApiPropertyOptional({ example: 'Менеджер по продажам' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}
