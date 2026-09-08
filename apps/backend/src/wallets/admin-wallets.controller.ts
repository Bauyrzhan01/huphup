import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { WalletsService } from './wallets.service';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AdjustBalanceDto, AdminWalletsQueryDto } from './dto/wallet.dto';

@ApiTags('admin-wallets')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/wallets')
export class AdminWalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  list(@Query() query: AdminWalletsQueryDto) {
    return this.walletsService.listAdmin(query);
  }

  @Get(':userId')
  getOne(@Param('userId') userId: string) {
    return this.walletsService.getAdmin(userId);
  }

  @Get(':userId/transactions')
  listTransactions(
    @Param('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.walletsService.listAdminTransactions(userId, query);
  }

  @Post(':userId/credit')
  credit(
    @CurrentUser() admin: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.walletsService.credit(admin.id, userId, dto);
  }

  @Post(':userId/debit')
  debit(
    @CurrentUser() admin: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.walletsService.debit(admin.id, userId, dto);
  }
}
