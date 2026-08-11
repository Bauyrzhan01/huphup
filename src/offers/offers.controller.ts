import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/offer.dto';
import { Roles } from '../common/decorators/roles.decorator';import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('offers')
@ApiBearerAuth()
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.id, dto);
  }

  @Get('mine')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  listMine(@CurrentUser() user: AuthUser) {
    return this.offersService.listMineForBuyer(user.id);
  }

  @Get('for-company')
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  listForCompany(@CurrentUser() user: AuthUser) {
    return this.offersService.listForCompany(user.id);
  }

  @Get('by-request/:requestId')
  listForRequest(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    return this.offersService.listForRequest(requestId, user.id, user.role);
  }

  @Post(':id/accept')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.accept(user.id, id);
  }

  @Post(':id/reject')
  @Roles(UserRole.BUYER, UserRole.ADMIN)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.reject(user.id, id);
  }

  @Post(':id/withdraw')
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.withdraw(user.id, id);
  }
}
