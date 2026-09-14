import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import {
  WalletScopeQueryDto,
  WalletTransactionsQueryDto,
} from './dto/wallet-scope.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiOperation({
    summary:
      'Balance of my wallet — company wallet for suppliers, personal with scope=user',
  })
  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser, @Query() query: WalletScopeQueryDto) {
    return this.billing.myWallet(user.id, query.scope);
  }

  @ApiOperation({ summary: 'Money movements on my wallet, newest first' })
  @Get('transactions')
  transactions(
    @CurrentUser() user: AuthUser,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.billing.myTransactions(user.id, query);
  }

  @ApiOperation({ summary: 'Prices that apply to me right now' })
  @Get('pricing')
  pricing(@CurrentUser() user: AuthUser) {
    return this.billing.myPricing(user.id);
  }
}
