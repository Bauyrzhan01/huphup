import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BannerAudience, BannerPlacement } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Admins paste addresses with stray spaces and capitals — clean them before validating. */
function toEmailList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

// App screens are relative paths ("/requests"), everything else must be a web URL.
const CTA_URL = /^(\/[^\s]*|https?:\/\/[^\s]+)$/;

export class CreateBannerDto {
  @ApiPropertyOptional({
    example: 'Скидка 10% на цемент',
    description: 'Only shown when the banner has no picture',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string | null;

  @ApiPropertyOptional({
    example: 'Только до конца месяца у проверенных поставщиков',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @ApiPropertyOptional({ example: '#111111' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'bgColor must be #RRGGBB' })
  bgColor?: string;

  @ApiPropertyOptional({ example: 'Подробнее' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ctaText?: string;

  @ApiPropertyOptional({
    example: 'https://huphup-frontend.vercel.app/suppliers',
  })
  @IsOptional()
  @Matches(CTA_URL, {
    message: 'ctaUrl must be an app path (/…) or an http(s) URL',
  })
  @MaxLength(500)
  ctaUrl?: string;

  @ApiPropertyOptional({ enum: BannerAudience, default: BannerAudience.ALL })
  @IsOptional()
  @IsEnum(BannerAudience)
  audience?: BannerAudience;

  @ApiPropertyOptional({ enum: BannerPlacement, default: BannerPlacement.CARD })
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;

  @ApiPropertyOptional({
    type: [String],
    example: ['tester@huphup.kz'],
    description:
      'Empty = everyone. Otherwise only these accounts see the banner — a test run before it goes live.',
  })
  @IsOptional()
  @Transform(({ value }) => toEmailList(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  testEmails?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Алматы'],
    description: 'Empty = all cities',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  cities?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}

export class ActiveBannersQueryDto {
  @ApiPropertyOptional({
    enum: ['BUYER', 'SUPPLIER'],
    description: 'Who is looking',
  })
  @IsOptional()
  @IsEnum([BannerAudience.BUYER, BannerAudience.SUPPLIER])
  audience?: BannerAudience;

  @ApiPropertyOptional({ example: 'Алматы' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @ApiPropertyOptional({
    enum: BannerPlacement,
    default: BannerPlacement.CARD,
    description: 'CARD — carousel on the home screen, POPUP — modal over it',
  })
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;
}
