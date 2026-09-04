import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CancelDealDto, DealsQueryDto } from './dto/deal.dto';
import { DealsService } from './deals.service';

@ApiTags('deals-admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/deals')
export class DealsAdminController {
  constructor(private readonly deals: DealsService) {}

  @ApiOperation({
    summary: 'Все сделки площадки, можно фильтровать по статусу',
  })
  @Get()
  list(@Query() query: DealsQueryDto) {
    return this.deals.adminList(query.status);
  }

  @ApiOperation({ summary: 'Решение спора в пользу поставщика: выдать деньги' })
  @Post(':id/release')
  release(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.deals.adminRelease(id, admin.id);
  }

  @ApiOperation({
    summary: 'Решение спора в пользу покупателя: вернуть деньги',
  })
  @Post(':id/refund')
  refund(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelDealDto,
  ) {
    return this.deals.adminRefund(id, admin.id, dto.reason);
  }
}
