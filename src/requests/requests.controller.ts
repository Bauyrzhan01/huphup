import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import {
  AnalyzeRequestDto,
  CreateRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Public()
  @Post('analyze')
  analyze(@Body() dto: AnalyzeRequestDto) {
    return this.requestsService.analyze(dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requestsService.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.requestsService.listMine(user.id);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requestsService.getById(id, user.id, user.role);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.requestsService.update(user.id, id, dto);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requestsService.publish(user.id, id);
  }
}
