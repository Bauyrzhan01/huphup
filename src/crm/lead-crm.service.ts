import { Injectable } from '@nestjs/common';
import {
  LeadActivityType,
  LeadStatus,
  LeadTaskKind,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_AUTOMATION_RULES,
  DEFAULT_CRM_STAGES,
  IDLE_NEW_HOURS,
  IDLE_STAGE_HOURS,
} from './crm.constants';

@Injectable()
export class LeadCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async ensureCompanyCrmDefaults(companyId: string) {
    const stageCount = await this.prisma.crmStageConfig.count({
      where: { companyId },
    });
    if (stageCount === 0) {
      await this.prisma.crmStageConfig.createMany({
        data: DEFAULT_CRM_STAGES.map((s) => ({ ...s, companyId })),
      });
    }
    const ruleCount = await this.prisma.crmAutomationRule.count({
      where: { companyId },
    });
    if (ruleCount === 0) {
      await this.prisma.crmAutomationRule.createMany({
        data: DEFAULT_AUTOMATION_RULES.map((r) => ({
          companyId,
          trigger: r.trigger,
          action: r.action,
          config: r.config,
        })),
      });
    }
  }

  async logActivity(input: {
    leadId: string;
    userId?: string | null;
    type: LeadActivityType;
    message: string;
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        userId: input.userId ?? undefined,
        type: input.type,
        message: input.message,
        meta: (input.meta ?? undefined) as object | undefined,
      },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async getActivities(leadId: string) {
    return this.prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async addNote(leadId: string, userId: string, body: string) {
    const trimmed = body.trim();
    const note = await this.prisma.leadNote.create({
      data: { leadId, userId, body: trimmed },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
    await this.logActivity({
      leadId,
      userId,
      type: LeadActivityType.NOTE_ADDED,
      message: trimmed.slice(0, 240),
    });
    return note;
  }

  async listNotes(leadId: string) {
    return this.prisma.leadNote.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async listTasks(leadId: string) {
    return this.prisma.leadTask.findMany({
      where: { leadId },
      orderBy: [{ doneAt: 'asc' }, { dueAt: 'asc' }],
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async createTask(
    leadId: string,
    userId: string,
    input: {
      title: string;
      kind: LeadTaskKind;
      dueAt: Date;
      assigneeId: string;
    },
  ) {
    const task = await this.prisma.leadTask.create({
      data: {
        leadId,
        creatorId: userId,
        assigneeId: input.assigneeId,
        kind: input.kind,
        title: input.title.trim(),
        dueAt: input.dueAt,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
    await this.logActivity({
      leadId,
      userId,
      type: LeadActivityType.NEXT_STEP_SET,
      message: input.title.trim(),
      meta: { taskId: task.id, kind: input.kind },
    });
    return task;
  }

  async completeTask(taskId: string, companyId: string, userId: string) {
    const task = await this.prisma.leadTask.findFirst({
      where: { id: taskId, lead: { companyId } },
    });
    if (!task || task.doneAt) {
      return task;
    }
    const updated = await this.prisma.leadTask.update({
      where: { id: task.id },
      data: { doneAt: new Date() },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
    await this.logActivity({
      leadId: task.leadId,
      userId,
      type: LeadActivityType.NOTE_ADDED,
      message: task.title,
      meta: { taskId: task.id, done: true },
    });
    return updated;
  }

  async listMyOpenTasks(companyId: string, userId: string) {
    return this.prisma.leadTask.findMany({
      where: {
        assigneeId: userId,
        doneAt: null,
        lead: { companyId },
      },
      orderBy: { dueAt: 'asc' },
      take: 20,
      include: {
        lead: {
          select: {
            id: true,
            request: { select: { code: true, title: true } },
          },
        },
      },
    });
  }

  async getStages(companyId: string) {
    await this.ensureCompanyCrmDefaults(companyId);
    return this.prisma.crmStageConfig.findMany({
      where: { companyId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateStages(
    companyId: string,
    stages: Array<{
      status: LeadStatus;
      label: string;
      sortOrder: number;
      color?: string;
    }>,
  ) {
    await this.ensureCompanyCrmDefaults(companyId);
    await this.prisma.$transaction(
      stages.map((stage) =>
        this.prisma.crmStageConfig.updateMany({
          where: { companyId, status: stage.status },
          data: {
            label: stage.label,
            sortOrder: stage.sortOrder,
            color: stage.color,
          },
        }),
      ),
    );
    return this.getStages(companyId);
  }

  async getAutomationRules(companyId: string) {
    await this.ensureCompanyCrmDefaults(companyId);
    return this.prisma.crmAutomationRule.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateAutomationRules(
    companyId: string,
    rules: Array<{ id: string; enabled: boolean }>,
  ) {
    await Promise.all(
      rules.map((rule) =>
        this.prisma.crmAutomationRule.updateMany({
          where: { id: rule.id, companyId },
          data: { enabled: rule.enabled },
        }),
      ),
    );
    return this.getAutomationRules(companyId);
  }

  isLeadIdle(lead: {
    status: LeadStatus;
    assigneeId: string | null;
    statusChangedAt: Date;
    nextStepAt: Date | null;
    createdAt: Date;
  }) {
    const now = Date.now();
    if (lead.nextStepAt && lead.nextStepAt.getTime() < now) {
      return 'overdue';
    }
    if (
      lead.status === LeadStatus.NEW &&
      !lead.assigneeId &&
      now - lead.createdAt.getTime() > IDLE_NEW_HOURS * 3600_000
    ) {
      return 'unassigned';
    }
    if (
      lead.status === LeadStatus.VIEWED &&
      now - lead.statusChangedAt.getTime() > IDLE_STAGE_HOURS * 3600_000
    ) {
      return 'idle';
    }
    return null;
  }

  async getAnalytics(companyId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { companyId },
      include: {
        assignee: { select: { id: true, fullName: true } },
      },
    });

    const byStatus = {
      NEW: 0,
      VIEWED: 0,
      OFFERED: 0,
      SKIPPED: 0,
    } as Record<LeadStatus, number>;

    let idleCount = 0;
    let overdueCount = 0;
    let totalResponseMs = 0;
    let responseCount = 0;

    const byAssignee = new Map<
      string,
      { name: string; total: number; offered: number }
    >();

    for (const lead of leads) {
      byStatus[lead.status] += 1;
      const idle = this.isLeadIdle(lead);
      if (idle === 'idle' || idle === 'unassigned') idleCount += 1;
      if (idle === 'overdue') overdueCount += 1;

      if (lead.claimedAt) {
        totalResponseMs += lead.claimedAt.getTime() - lead.createdAt.getTime();
        responseCount += 1;
      }

      if (lead.assigneeId && lead.assignee) {
        const row = byAssignee.get(lead.assigneeId) ?? {
          name: lead.assignee.fullName,
          total: 0,
          offered: 0,
        };
        row.total += 1;
        if (lead.status === LeadStatus.OFFERED) row.offered += 1;
        byAssignee.set(lead.assigneeId, row);
      }
    }

    const total = leads.length;
    const offered = byStatus.OFFERED;
    const viewedOrMore = byStatus.VIEWED + offered + byStatus.SKIPPED;

    return {
      total,
      byStatus,
      conversionRate: total ? Math.round((offered / total) * 100) : 0,
      viewRate: total ? Math.round((viewedOrMore / total) * 100) : 0,
      avgResponseHours: responseCount
        ? Math.round((totalResponseMs / responseCount / 3600_000) * 10) / 10
        : null,
      idleCount,
      overdueCount,
      byAssignee: [...byAssignee.entries()].map(([userId, row]) => ({
        userId,
        ...row,
      })),
    };
  }

  async runAutomations(companyId: string, ownerId: string) {
    const rules = await this.getAutomationRules(companyId);
    const enabled = rules.filter((r) => r.enabled);
    if (!enabled.length) return;

    const leads = await this.prisma.lead.findMany({
      where: { companyId },
      include: { assignee: { select: { id: true } } },
    });

    const since = new Date(Date.now() - 24 * 3600_000);
    const recentAuto = await this.prisma.leadActivity.findMany({
      where: {
        lead: { companyId },
        type: LeadActivityType.STATUS_CHANGED,
        message: { startsWith: '[auto]' },
        createdAt: { gte: since },
      },
      select: { leadId: true, message: true },
    });
    const notified = new Set(recentAuto.map((a) => `${a.leadId}:${a.message}`));

    for (const lead of leads) {
      for (const rule of enabled) {
        const cfg = (rule.config ?? {}) as { hours?: number; statuses?: string[] };
        const hours = cfg.hours ?? 24;
        const key = `${lead.id}:${rule.trigger}`;

        if (rule.trigger === 'NEW_UNASSIGNED') {
          if (lead.status !== LeadStatus.NEW || lead.assigneeId) continue;
          const age = Date.now() - lead.createdAt.getTime();
          if (age < hours * 3600_000) continue;
          if (notified.has(key)) continue;
          await this.notifications.notifyUsers([ownerId], {
            type: NotificationType.NEW_LEAD,
            title: 'Заявка ждёт менеджера',
            body: `${lead.requestId}: inbox lead unassigned`,
            payload: { leadId: lead.id },
          });
          await this.logActivity({
            leadId: lead.id,
            type: LeadActivityType.STATUS_CHANGED,
            message: `[auto] ${rule.trigger}`,
          });
          notified.add(key);
        }

        if (rule.trigger === 'IDLE_IN_STATUS') {
          const statuses = (cfg.statuses ?? ['VIEWED']) as LeadStatus[];
          if (!statuses.includes(lead.status) || !lead.assigneeId) continue;
          const idle = Date.now() - lead.statusChangedAt.getTime();
          if (idle < hours * 3600_000) continue;
          if (notified.has(key)) continue;
          await this.notifications.notifyUsers([lead.assigneeId], {
            type: NotificationType.SYSTEM,
            title: 'Напоминание по заявке',
            body: 'Lead idle — follow up needed',
            payload: { leadId: lead.id },
          });
          await this.logActivity({
            leadId: lead.id,
            userId: lead.assigneeId,
            type: LeadActivityType.STATUS_CHANGED,
            message: `[auto] ${rule.trigger}`,
          });
          notified.add(key);
        }
      }
    }
  }
}
