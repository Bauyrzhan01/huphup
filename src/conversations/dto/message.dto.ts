import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Добрый день, готов уточнить сроки.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class PinConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
