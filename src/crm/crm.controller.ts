import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadCrmService } from './lead-crm.service';
import { SupplierMember } from '../common/decorators/supplier-member.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CompaniesService } from '../companies/companies.service';
import { UpdateAutomationDto, UpdateCrmStagesDto } from './dto/crm.dto';

@ApiTags('crm')
@ApiBearerAuth()
@SupplierMember()
@Controller('crm')
export class CrmController {
  constructor(
    private readonly crm: LeadCrmService,
    private readonly companies: CompaniesService,
  ) {}

  private async companyId(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      return null;
    }
    return resolved.company.id;
  }

  @Get('stages')
  async stages(@CurrentUser() user: AuthUser) {
    const companyId = await this.companyId(user.id);
    if (!companyId) return [];
    return this.crm.getStages(companyId);
  }

  @Put('stages')
  async updateStages(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCrmStagesDto,
  ) {
    const resolved = await this.companies.requireCompanyForUser(user.id);
    if (!resolved.isOwner && resolved.company.ownerId !== user.id) {
      throw new ForbiddenException('Only company owner can edit CRM stages');
    }
    return this.crm.updateStages(
      resolved.company.id,
      dto.stages.map((s, i) => ({
        status: s.status,
        label: s.label,
        sortOrder: s.sortOrder ?? i,
        color: s.color,
      })),
    );
  }

  @Get('automation')
  async automation(@CurrentUser() user: AuthUser) {
    const companyId = await this.companyId(user.id);
    if (!companyId) return [];
    return this.crm.getAutomationRules(companyId);
  }

  @Put('automation')
  async updateAutomation(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAutomationDto,
  ) {
    const resolved = await this.companies.requireCompanyForUser(user.id);
    if (!resolved.isOwner && resolved.company.ownerId !== user.id) {
      throw new ForbiddenException('Only company owner can edit automation');
    }
    return this.crm.updateAutomationRules(resolved.company.id, dto.rules);
  }

  @Get('analytics')
  async analytics(@CurrentUser() user: AuthUser) {
    const companyId = await this.companyId(user.id);
    if (!companyId) {
      return {
        total: 0,
        byStatus: { NEW: 0, VIEWED: 0, OFFERED: 0, SKIPPED: 0 },
        conversionRate: 0,
        viewRate: 0,
        avgResponseHours: null,
        idleCount: 0,
        overdueCount: 0,
        byAssignee: [],
        openTasks: 0,
        currency: 'KZT',
        leadDeltaPct: null,
        acceptedDeltaPct: null,
        currentLeads: 0,
        previousLeads: 0,
        acceptedAmount: 0,
        pendingAmount: 0,
        currentAcceptedAmount: 0,
        series: [],
      };
    }
    return this.crm.getAnalytics(companyId);
  }
}
