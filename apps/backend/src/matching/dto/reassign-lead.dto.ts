import { IsString, MinLength } from 'class-validator';

export class ReassignLeadDto {
  @IsString()
  @MinLength(1)
  assigneeId!: string;
}
