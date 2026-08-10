import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, user.role, dto);
  }

  @Public()
  @Get()
  list(@Query('city') city?: string, @Query('q') q?: string) {
    return this.companiesService.list({ city, q });
  }

  @Get('me')
  myCompany(@CurrentUser() user: AuthUser) {
    return this.companiesService.getMyCompany(user.id);
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
