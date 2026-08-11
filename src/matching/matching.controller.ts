import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MatchingService } from './matching.service';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@Roles(UserRole.SUPPLIER, UserRole.ADMIN)
@Controller('leads')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matchingService.listLeadsForSupplier(user.id);
  }

  @Post(':id/view')
  view(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.markLeadViewed(user.id, id);
  }

  @Post(':id/skip')
  skip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.skipLead(user.id, id);
  }
}
