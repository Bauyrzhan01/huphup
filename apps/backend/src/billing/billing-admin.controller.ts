import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  BillingService,
  WalletOwner,
  serializeTransaction,
} from './billing.service';
import {
  AdjustDto,
  TopUpDto,
  TransactionsQueryDto,
  UpdatePricingDto,
  WalletOwnerDto,
  WalletsQueryDto,
} from './dto/billing.dto';

@ApiTags('billing-admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/billing')
export class BillingAdminController {
  constructor(private readonly billing: BillingService) {}

  @ApiOperation({ summary: 'Wallets with balances, searchable by owner' })
  @Get('wallets')
  wallets(@Query() query: WalletsQueryDto) {
    return this.billing.listWallets(query);
  }

  @ApiOperation({ summary: 'Every money movement on the platform' })
  @Get('transactions')
  transactions(@Query() query: TransactionsQueryDto) {
    return this.billing.listTransactions(query);
  }

  @ApiOperation({
    summary:
      'Credit a wallet after an offline payment (bank transfer, invoice)',
  })
  @Post('topup')
  async topUp(@CurrentUser() admin: AuthUser, @Body() dto: TopUpDto) {
    const result = await this.billing.topUp({
      owner: ownerFrom(dto),
      amount: dto.amount,
      comment: dto.comment,
      createdById: admin.id,
      idempotencyKey: dto.idempotencyKey,
    });

    return {
      transaction: serializeTransaction(result.transaction),
      balance: result.balance.toString(),
      duplicate: result.duplicate,
    };
  }

  @ApiOperation({ summary: 'Manual correction, may be negative' })
  @Post('adjust')
  async adjust(@CurrentUser() admin: AuthUser, @Body() dto: AdjustDto) {
    if (dto.amount === 0) {
      throw new BadRequestException('Amount must not be zero');
    }

    const result = await this.billing.adjust({
      owner: ownerFrom(dto),
      amount: dto.amount,
      comment: dto.comment,
      createdById: admin.id,
      idempotencyKey: dto.idempotencyKey,
    });

    return {
      transaction: serializeTransaction(result.transaction),
      balance: result.balance.toString(),
      duplicate: result.duplicate,
    };
  }

  @ApiOperation({ summary: 'Platform prices and per-company overrides' })
  @Get('pricing')
  pricing() {
    return this.billing.listPricing();
  }

  @ApiOperation({
    summary: 'Set prices; a disabled rule keeps the action free',
  })
  @Put('pricing')
  updatePricing(@Body() dto: UpdatePricingDto) {
    return this.billing.upsertPricing(dto.rules);
  }
}

function ownerFrom(dto: WalletOwnerDto): WalletOwner {
  const hasCompany = Boolean(dto.companyId);
  const hasUser = Boolean(dto.userId);
  if (hasCompany === hasUser) {
    throw new BadRequestException('Pass exactly one of companyId or userId');
  }
  return hasCompany ? { companyId: dto.companyId! } : { userId: dto.userId! };
}
