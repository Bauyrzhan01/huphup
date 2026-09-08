import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeadStatus,
  LeadTaskKind,
  LeadTaskPriority,
  LeadTaskStatus,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status!: LeadStatus;
}

export class AddLeadNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}

export class CreateLeadTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({ enum: LeadTaskKind })
  @IsEnum(LeadTaskKind)
  kind!: LeadTaskKind;

  @ApiProperty()
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LeadTaskPriority })
  @IsOptional()
  @IsEnum(LeadTaskPriority)
  priority?: LeadTaskPriority;
}

export class UpdateLeadTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ enum: LeadTaskKind })
  @IsOptional()
  @IsEnum(LeadTaskKind)
  kind?: LeadTaskKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LeadTaskStatus })
  @IsOptional()
  @IsEnum(LeadTaskStatus)
  status?: LeadTaskStatus;

  @ApiPropertyOptional({ enum: LeadTaskPriority })
  @IsOptional()
  @IsEnum(LeadTaskPriority)
  priority?: LeadTaskPriority;
}

export class AddLeadTaskCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}

export class SetNextStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class BulkLeadsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: ['skip', 'reassign', 'status'] })
  @IsString()
  action!: 'skip' | 'reassign' | 'status';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}

class CrmStageItemDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateCrmStagesDto {
  @ValidateNested({ each: true })
  @Type(() => CrmStageItemDto)
  stages!: CrmStageItemDto[];
}

class AutomationToggleDto {
  @IsString()
  id!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateAutomationDto {
  @ValidateNested({ each: true })
  @Type(() => AutomationToggleDto)
  rules!: AutomationToggleDto[];
}
