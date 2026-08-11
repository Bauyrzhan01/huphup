import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Добрый день, готов уточнить сроки.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
