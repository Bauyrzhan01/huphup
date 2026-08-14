import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ReassignLeadDto } from './dto/reassign-lead.dto';

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

  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.claimLead(user.id, id);
  }

  @Post(':id/reassign')
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReassignLeadDto,
  ) {
    return this.matchingService.reassignLead(user.id, id, dto.assigneeId);
  }

  @Post(':id/skip')
  skip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.skipLead(user.id, id);
  }
}
