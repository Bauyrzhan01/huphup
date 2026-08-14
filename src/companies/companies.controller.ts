import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { CreateInviteDto } from './dto/invite.dto';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @SupplierMember()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, user.role, dto);
  }

  @Public()
  @Get()
  list(
    @Query('city') city?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companiesService.list({
      city,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('me')
  myCompany(@CurrentUser() user: AuthUser) {
    return this.companiesService.getMyCompany(user.id);
  }

  @Get('me/members')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.companiesService.listMembers(user.id);
  }

  @Delete('me/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('userId') memberUserId: string,
  ) {
    return this.companiesService.removeMember(user.id, memberUserId);
  }

  @Post('me/invites')
  createInvite(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.companiesService.createInvite(user.id, dto);
  }

  @Post('me/logo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companiesService.uploadLogo(user.id, file);
  }

  @Delete('me/logo')
  removeLogo(@CurrentUser() user: AuthUser) {
    return this.companiesService.removeLogo(user.id);
  }

  @Public()
  @Get(':id/products')
  listProducts(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companiesService.listPublicProducts(id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.companiesService.getById(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(user.id, id, dto);
  }
}
