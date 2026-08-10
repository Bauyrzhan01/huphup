import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/offer.dto';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('offers')
@ApiBearerAuth()
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.id, dto);
  }

  @Get('by-request/:requestId')
  listForRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    return this.offersService.listForRequest(requestId, user.id, user.role);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.accept(user.id, id);
  }
}
