import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matchingService.listLeadsForSupplier(user.id);
  }

  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @Post(':id/view')
  view(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.markLeadViewed(user.id, id);
  }
}
