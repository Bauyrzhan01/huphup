import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@SupplierMember()
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
