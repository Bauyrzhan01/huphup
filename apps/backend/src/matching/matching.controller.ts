import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ReassignLeadDto } from './dto/reassign-lead.dto';
import {
  AddLeadNoteDto,
  AddLeadTaskCommentDto,
  BulkLeadsDto,
  CreateLeadTaskDto,
  SetNextStepDto,
  UpdateLeadStatusDto,
  UpdateLeadTaskDto,
} from '../crm/dto/crm.dto';

@ApiTags('leads')
@ApiBearerAuth()
@SupplierMember()
@Controller('leads')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('tasks/mine')
  myTasks(@CurrentUser() user: AuthUser) {
    return this.matchingService.listMyTasks(user.id);
  }

  @Get('tasks/board')
  boardTasks(@CurrentUser() user: AuthUser) {
    return this.matchingService.listBoardTasks(user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matchingService.listLeadsForSupplier(user.id);
  }

  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkLeadsDto) {
    return this.matchingService.bulkUpdate(user.id, dto);
  }

  @Get(':id/activities')
  activities(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.getActivities(user.id, id);
  }

  @Get(':id/notes')
  notes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.getNotes(user.id, id);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddLeadNoteDto,
  ) {
    return this.matchingService.addNote(user.id, id, dto.body);
  }

  @Get(':id/tasks')
  tasks(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchingService.listTasks(user.id, id);
  }

  @Post(':id/tasks')
  createTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateLeadTaskDto,
  ) {
    return this.matchingService.createTask(user.id, id, dto);
  }

  @Post(':id/tasks/:taskId/complete')
  completeTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.matchingService.completeTask(user.id, id, taskId);
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLeadTaskDto,
  ) {
    return this.matchingService.updateTask(user.id, id, taskId, dto);
  }

  @Get(':id/tasks/:taskId/comments')
  taskComments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.matchingService.listTaskComments(user.id, id, taskId);
  }

  @Post(':id/tasks/:taskId/comments')
  addTaskComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: AddLeadTaskCommentDto,
  ) {
    return this.matchingService.addTaskComment(user.id, id, taskId, dto.body);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.matchingService.updateStatus(user.id, id, dto.status);
  }

  @Patch(':id/next-step')
  setNextStep(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetNextStepDto,
  ) {
    return this.matchingService.setNextStep(user.id, id, dto);
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
