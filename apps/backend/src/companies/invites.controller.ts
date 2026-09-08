import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from '../companies/companies.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Public()
  @Get(':token')
  getInvite(@Param('token') token: string) {
    return this.companiesService.getInvitePublic(token);
  }

  @ApiBearerAuth()
  @Post(':token/accept')
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.companiesService.acceptInvite(user.id, token);
  }
}
