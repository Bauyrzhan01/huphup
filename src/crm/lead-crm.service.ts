import { Injectable } from '@nestjs/common';
import {
  Prisma,
  LeadActivityType,
  LeadStatus,
  LeadTaskKind,
  LeadTaskPriority,
  LeadTaskStatus,
  NotificationType,
  OfferStatus,
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

  private taskInclude() {
    return {
      assignee: {
        select: { id: true, fullName: true, avatarUrl: true, lastSeenAt: true },
      },
      creator: {
        select: { id: true, fullName: true, avatarUrl: true },
      },
      lead: {
        select: {
          id: true,
          request: { select: { code: true, title: true } },
        },
      },
      _count: { select: { comments: true } },
    };
  }

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
    meta?: Prisma.InputJsonValue;
  }) {
    return this.prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        userId: input.userId ?? undefined,
        type: input.type,
        message: input.message,
        meta: input.meta ?? undefined,
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
      orderBy: [{ dueAt: 'asc' }],
      include: this.taskInclude(),
    });
  }

  async listCompanyTasks(companyId: string) {
    return this.prisma.leadTask.findMany({
      where: { companyId },
      orderBy: [{ dueAt: 'asc' }],
      take: 200,
      include: this.taskInclude(),
    });
  }

  async createTask(
    leadId: string,
    companyId: string,
    userId: string,
    input: {
      title: string;
      kind: LeadTaskKind;
      dueAt: Date;
      assigneeId: string;
      description?: string;
      priority?: LeadTaskPriority;
    },
  ) {
    const task = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: companyId },
        data: { taskSeq: { increment: 1 } },
      });
      return tx.leadTask.create({
        data: {
          companyId,
          leadId,
          creatorId: userId,
          assigneeId: input.assigneeId,
          code: `T-${company.taskSeq}`,
          kind: input.kind,
          priority: input.priority ?? LeadTaskPriority.MEDIUM,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          dueAt: input.dueAt,
          status: LeadTaskStatus.TODO,
        },
        include: this.taskInclude(),
      });
    });
    await this.logActivity({
      leadId,
      userId,
      type: LeadActivityType.NEXT_STEP_SET,
      message: `${task.code} ${input.title.trim()}`,
      meta: { taskId: task.id, kind: input.kind, code: task.code },
    });
    if (input.assigneeId !== userId) {
      await this.notifications.notifyUsers([input.assigneeId], {
        type: NotificationType.SYSTEM,
        title: task.code,
        body: input.title.trim(),
        payload: { leadId, taskId: task.id },
      });
    }
    return task;
  }

  async updateTask(
    taskId: string,
    companyId: string,
    userId: string,
    input: {
      title?: string;
      kind?: LeadTaskKind;
      dueAt?: Date;
      assigneeId?: string;
      description?: string | null;
      status?: LeadTaskStatus;
      priority?: LeadTaskPriority;
    },
  ) {
    const task = await this.prisma.leadTask.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) return null;

    const status = input.status;
    const doneAt =
      status === LeadTaskStatus.DONE
        ? (task.doneAt ?? new Date())
        : status
          ? null
          : undefined;

    const updated = await this.prisma.leadTask.update({
      where: { id: task.id },
      data: {
        title: input.title?.trim(),
        kind: input.kind,
        dueAt: input.dueAt,
        assigneeId: input.assigneeId,
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        status,
        priority: input.priority,
        doneAt,
      },
      include: this.taskInclude(),
    });
    await this.logActivity({
      leadId: task.leadId,
      userId,
      type: LeadActivityType.STATUS_CHANGED,
      message: updated.code,
      meta: {
        taskId: updated.id,
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId,
      },
    });
    if (
      input.assigneeId &&
      input.assigneeId !== userId &&
      input.assigneeId !== task.assigneeId
    ) {
      await this.notifications.notifyUsers([input.assigneeId], {
        type: NotificationType.SYSTEM,
        title: updated.code,
        body: updated.title,
        payload: { leadId: task.leadId, taskId: updated.id },
      });
    }
    return updated;
  }

  async completeTask(taskId: string, companyId: string, userId: string) {
    return this.updateTask(taskId, companyId, userId, {
      status: LeadTaskStatus.DONE,
    });
  }

  async listComments(taskId: string, companyId: string) {
    const task = await this.prisma.leadTask.findFirst({
      where: { id: taskId, companyId },
      select: { id: true },
    });
    if (!task) return [];
    return this.prisma.leadTaskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async addComment(
    taskId: string,
    companyId: string,
    userId: string,
    body: string,
  ) {
    const task = await this.prisma.leadTask.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) return null;
    const comment = await this.prisma.leadTaskComment.create({
      data: { taskId, userId, body: body.trim() },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
    await this.logActivity({
      leadId: task.leadId,
      userId,
      type: LeadActivityType.NOTE_ADDED,
      message: `${task.code}: ${body.trim().slice(0, 200)}`,
      meta: { taskId: task.id, commentId: comment.id },
    });
    return comment;
  }

  async listMyOpenTasks(companyId: string, userId: string) {
    return this.prisma.leadTask.findMany({
      where: {
        assigneeId: userId,
        status: { not: LeadTaskStatus.DONE },
        lead: { companyId },
      },
      orderBy: [{ dueAt: 'asc' }],
      take: 30,
      include: this.taskInclude(),
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

    const days = 14;
    const dayKeys = this.lastUtcDays(days);
    const prevKeys = this.lastUtcDays(days * 2).slice(0, days);
    const leadByDay = new Map(dayKeys.map((d) => [d, 0]));
    const prevLeadCount = { n: 0 };
    const currentLeadCount = { n: 0 };

    for (const lead of leads) {
      const key = this.utcDay(lead.createdAt);
      if (leadByDay.has(key)) {
        leadByDay.set(key, (leadByDay.get(key) ?? 0) + 1);
        currentLeadCount.n += 1;
      } else if (prevKeys.includes(key)) {
        prevLeadCount.n += 1;
      }
    }

    const since = new Date(`${prevKeys[0] ?? dayKeys[0]}T00:00:00.000Z`);
    const offers = await this.prisma.offer.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: { price: true, status: true, createdAt: true, currency: true },
    });

    const offerCountByDay = new Map(dayKeys.map((d) => [d, 0]));
    const acceptedSumByDay = new Map(dayKeys.map((d) => [d, 0]));
    const offerSumByDay = new Map(dayKeys.map((d) => [d, 0]));
    let currentAccepted = 0;
    let previousAccepted = 0;
    let pendingSum = 0;
    let acceptedSumAll = 0;
    let currency = 'KZT';

    for (const offer of offers) {
      const key = this.utcDay(offer.createdAt);
      const price = Number(offer.price);
      if (offer.currency) currency = offer.currency;
      if (offer.status === OfferStatus.PENDING) pendingSum += price;
      if (offer.status === OfferStatus.ACCEPTED) acceptedSumAll += price;

      if (offerCountByDay.has(key)) {
        offerCountByDay.set(key, (offerCountByDay.get(key) ?? 0) + 1);
        offerSumByDay.set(key, (offerSumByDay.get(key) ?? 0) + price);
        if (offer.status === OfferStatus.ACCEPTED) {
          acceptedSumByDay.set(key, (acceptedSumByDay.get(key) ?? 0) + price);
          currentAccepted += price;
        }
      } else if (
        prevKeys.includes(key) &&
        offer.status === OfferStatus.ACCEPTED
      ) {
        previousAccepted += price;
      }
    }

    const openTasks = await this.prisma.leadTask.count({
      where: { companyId, status: { not: LeadTaskStatus.DONE } },
    });

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
      openTasks,
      currency,
      leadDeltaPct: this.deltaPct(currentLeadCount.n, prevLeadCount.n),
      acceptedDeltaPct: this.deltaPct(currentAccepted, previousAccepted),
      currentLeads: currentLeadCount.n,
      previousLeads: prevLeadCount.n,
      acceptedAmount: Math.round(acceptedSumAll),
      pendingAmount: Math.round(pendingSum),
      currentAcceptedAmount: Math.round(currentAccepted),
      series: dayKeys.map((date) => ({
        date,
        leads: leadByDay.get(date) ?? 0,
        offers: offerCountByDay.get(date) ?? 0,
        offerAmount: Math.round(offerSumByDay.get(date) ?? 0),
        acceptedAmount: Math.round(acceptedSumByDay.get(date) ?? 0),
      })),
    };
  }

  private utcDay(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private lastUtcDays(count: number) {
    const days: string[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
      );
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }

  private deltaPct(current: number, previous: number) {
    if (previous <= 0) return current > 0 ? null : 0;
    return Math.round(((current - previous) / previous) * 100);
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
        const cfg = (rule.config ?? {}) as {
          hours?: number;
          statuses?: string[];
        };
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
