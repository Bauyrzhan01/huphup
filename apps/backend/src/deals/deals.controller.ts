import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CancelDealDto, DisputeDealDto } from './dto/deal.dto';
import { DealsService } from './deals.service';

@ApiTags('deals')
@ApiBearerAuth()
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @ApiOperation({
    summary: 'Мои сделки: покупателю свои, поставщику — компании',
  })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.deals.listMine(user.id);
  }

  @ApiOperation({ summary: 'Карточка сделки' })
  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.getOne(user.id, id);
  }

  @ApiOperation({
    summary: 'Покупатель оплачивает: деньги уходят на удержание площадке',
  })
  @Post(':id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.pay(user.id, id);
  }

  @ApiOperation({ summary: 'Поставщик отмечает отгрузку' })
  @Post(':id/ship')
  ship(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.ship(user.id, id);
  }

  @ApiOperation({
    summary: 'Покупатель подтверждает получение — деньги уходят поставщику',
  })
  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.confirm(user.id, id);
  }

  @ApiOperation({ summary: 'Отмена до отгрузки с возвратом денег покупателю' })
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelDealDto,
  ) {
    return this.deals.cancel(user.id, id, dto.reason);
  }

  @ApiOperation({ summary: 'Спор: останавливает автовыпуск, решает площадка' })
  @Post(':id/dispute')
  dispute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DisputeDealDto,
  ) {
    return this.deals.dispute(user.id, id, dto.reason);
  }
}
