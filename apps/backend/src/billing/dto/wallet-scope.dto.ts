import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const WALLET_SCOPES = ['user', 'company'];

const scopeDoc = {
  enum: WALLET_SCOPES,
  description:
    'user — personal wallet (own purchases are paid from it); company — the company wallet. Default: the company wallet when the user has a company',
};

export class WalletScopeQueryDto {
  @ApiPropertyOptional(scopeDoc)
  @IsOptional()
  @IsIn(WALLET_SCOPES)
  scope?: 'user' | 'company';
}

export class WalletTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional(scopeDoc)
  @IsOptional()
  @IsIn(WALLET_SCOPES)
  scope?: 'user' | 'company';
}
