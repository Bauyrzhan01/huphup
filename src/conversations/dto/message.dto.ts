import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Добрый день, готов уточнить сроки.' })
  @IsString()
  @MinLength(1)
  body!: string;
}
