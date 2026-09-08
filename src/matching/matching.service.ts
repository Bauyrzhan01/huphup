import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadActivityType, LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { GeminiInlineFile, GeminiService } from '../gemini/gemini.service';
import { StorageService } from '../storage/storage.service';
import { LeadCrmService } from '../crm/lead-crm.service';
import type {
  BulkLeadsDto,
  CreateLeadTaskDto,
  SetNextStepDto,
  UpdateLeadTaskDto,
} from '../crm/dto/crm.dto';

/** Только эти типы Gemini умеет читать напрямую — не рискуем слать остальное. */
const GEMINI_READABLE_MIME = /^image\/|^application\/pdf$/;
const MAX_ATTACHMENT_FILES = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const leadRequestSelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  category: true,
  city: true,
  quantity: true,
  deadline: true,
  status: true,
  createdAt: true,
} as const;

const leadUserSelect = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  lastSeenAt: true,
} as const;

const leadInclude = {
  request: { select: leadRequestSelect },
  assignee: { select: leadUserSelect },
  lastActor: { select: leadUserSelect },
  matchedProduct: {
    select: {
      id: true,
      name: true,
      unit: true,
      priceFrom: true,
      currency: true,
      city: true,
    },
  },
} as const;

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly gemini: GeminiService,
    private readonly crm: LeadCrmService,
    private readonly storage: StorageService,
  ) {}

  async createLeadsForRequest(requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      return [];
    }

    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 500,
      orderBy: { updatedAt: 'desc' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            city: true,
            verified: true,
            rating: true,
          },
        },
      },
    });

    const requestText = [request.description, request.rawText, request.title]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join('\n');

    const attachments = await this.loadGeminiAttachments(requestId);

    let matches = await this.gemini.matchProducts({
      requestText,
      title: request.title,
      category: request.category,
      city: request.city,
      products,
      attachments,
    });

    if (!matches.length) {
      this.logger.log(
        'Gemini returned no matches; falling back to keyword product match',
      );
      matches = this.keywordMatch(requestText, request, products);
    }

    const scored = matches.map((m) => ({
      companyId: m.companyId,
      score: m.score,
      reason: m.reason,
      productId: m.productId,
    }));

    const created: {
      leadId: string;
      companyId: string;
      memberUserIds: string[];
      score: number;
      productId?: string;
      reason?: string;
    }[] = [];

    for (const item of scored) {
      const lead = await this.prisma.lead.upsert({
        where: {
          requestId_companyId: {
            requestId,
            companyId: item.companyId,
          },
        },
        create: {
          requestId,
          companyId: item.companyId,
          score: item.score,
          matchReason: item.reason?.slice(0, 500),
          matchedProductId: item.productId ?? null,
        },
        update: {
          score: item.score,
          matchReason: item.reason?.slice(0, 500),
          matchedProductId: item.productId ?? null,
        },
      });
      await this.crm.logActivity({
        leadId: lead.id,
        type: LeadActivityType.CREATED,
        message: `Lead matched (score ${Math.round(item.score)})`,
        meta: { reason: item.reason, productId: item.productId },
      });
      const memberUserIds = await this.companies.listMemberUserIds(
        item.companyId,
      );
      created.push({
        leadId: lead.id,
        companyId: item.companyId,
        memberUserIds,
        score: item.score,
        productId: item.productId,
        reason: item.reason,
      });
    }

    this.logger.log(
      `Created ${created.length} leads for request ${request.code}`,
    );
    return created;
  }

  async createDirectLead(
    requestId: string,
    companyId: string,
    productId: string,
    reason: string,
  ) {
    const lead = await this.prisma.lead.upsert({
      where: {
        requestId_companyId: { requestId, companyId },
      },
      create: {
        requestId,
        companyId,
        score: 100,
        matchReason: reason.slice(0, 500),
        matchedProductId: productId,
      },
      update: {
        score: 100,
        matchReason: reason.slice(0, 500),
        matchedProductId: productId,
      },
    });
    await this.crm.logActivity({
      leadId: lead.id,
      type: LeadActivityType.CREATED,
      message: 'Direct product request',
      meta: { productId, reason },
    });
    const memberUserIds = await this.companies.listMemberUserIds(companyId);
    return {
      leadId: lead.id,
      companyId,
      memberUserIds,
      score: 100,
      productId,
      reason,
    };
  }

  /**
   * Loads the request's attached spec files (photos/PDFs) as base64 for
   * Gemini's multimodal matching, so it can read exact specs off the file
   * instead of relying only on the buyer's free-text description. Caps
   * count and size to keep the prompt cheap; skips unreadable types and
   * any file that fails to download rather than failing the whole match.
   */
  private async loadGeminiAttachments(
    requestId: string,
  ): Promise<GeminiInlineFile[]> {
    const attachments = await this.prisma.attachment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });

    const candidates = attachments
      .filter(
        (a) =>
          a.mimeType &&
          GEMINI_READABLE_MIME.test(a.mimeType) &&
          (a.sizeBytes == null || a.sizeBytes <= MAX_ATTACHMENT_BYTES),
      )
      .slice(0, MAX_ATTACHMENT_FILES);

    const files: GeminiInlineFile[] = [];
    for (const attachment of candidates) {
      try {
        const bytes = await this.storage.readAttachmentBytes(
          attachment.fileUrl,
        );
        // sizeBytes on the record can be missing or stale; re-check the
        // actual downloaded size before it goes anywhere near the prompt.
        if (!bytes || !bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) {
          continue;
        }
        files.push({
          mimeType: attachment.mimeType as string,
          data: bytes.toString('base64'),
        });
      } catch (err) {
        this.logger.warn(
          `Skipping attachment ${attachment.id} for Gemini matching: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return files;
  }

  private keywordMatch(
    requestText: string,
    request: {
      title: string;
      description: string;
      category: string | null;
      city: string | null;
    },
    products: Array<{
      id: string;
      name: string;
      description: string | null;
      city: string | null;
      company: {
        id: string;
        name: string;
        city: string | null;
        verified: boolean;
        rating: number;
      };
    }>,
  ) {
    const hay =
      `${requestText} ${request.category ?? ''} ${request.city ?? ''}`.toLowerCase();
    const tokens = hay
      .split(/[^a-zA-Zа-яА-ЯёЁәғқңөұүһі0-9]+/u)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    const byCompany = new Map<
      string,
      { productId: string; companyId: string; score: number; reason: string }
    >();

    for (const p of products) {
      const blob =
        `${p.name} ${p.description ?? ''} ${p.company.name}`.toLowerCase();
      let hits = 0;
      for (const token of tokens) {
        if (blob.includes(token)) hits += 1;
      }
      if (hits === 0) continue;

      let score = Math.min(95, 50 + hits * 8);
      if (
        request.city &&
        (p.city || p.company.city) &&
        (p.city || p.company.city)!.toLowerCase() === request.city.toLowerCase()
      ) {
        score += 8;
      }
      if (p.company.verified) score += 3;

      const prev = byCompany.get(p.company.id);
      if (!prev || score > prev.score) {
        byCompany.set(p.company.id, {
          productId: p.id,
          companyId: p.company.id,
          score: Math.min(100, score),
          reason: `keyword hits on ${p.name}`,
        });
      }
    }

    return [...byCompany.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }

  async listLeadsForSupplier(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      return [];
    }

    await this.backfillAssigneesFromOffers(resolved.company.id);
    await this.crm.ensureCompanyCrmDefaults(resolved.company.id);
    void this.crm
      .runAutomations(resolved.company.id, resolved.company.ownerId)
      .catch(() => undefined);

    const leads = await this.prisma.lead.findMany({
      where: { companyId: resolved.company.id },
      orderBy: [{ status: 'asc' }, { score: 'desc' }, { createdAt: 'desc' }],
      include: leadInclude,
    });

    return leads.map((lead) => ({
      ...lead,
      idleState: this.crm.isLeadIdle(lead),
    }));
  }

  /** Old offered leads had no assignee — attach the manager who sent the KP. */
  private async backfillAssigneesFromOffers(companyId: string) {
    const orphans = await this.prisma.lead.findMany({
      where: {
        companyId,
        status: LeadStatus.OFFERED,
        assigneeId: null,
      },
      select: { id: true, requestId: true },
    });
    if (!orphans.length) return;

    const offers = await this.prisma.offer.findMany({
      where: {
        companyId,
        requestId: { in: orphans.map((l) => l.requestId) },
      },
      orderBy: { createdAt: 'desc' },
      select: { requestId: true, authorId: true, createdAt: true },
    });
    const authorByRequest = new Map<
      string,
      { authorId: string; createdAt: Date }
    >();
    for (const offer of offers) {
      if (!authorByRequest.has(offer.requestId)) {
        authorByRequest.set(offer.requestId, {
          authorId: offer.authorId,
          createdAt: offer.createdAt,
        });
      }
    }

    await Promise.all(
      orphans.map((lead) => {
        const offer = authorByRequest.get(lead.requestId);
        if (!offer) return Promise.resolve();
        return this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            assigneeId: offer.authorId,
            lastActorId: offer.authorId,
            claimedAt: offer.createdAt,
          },
        });
      }),
    );
  }

  private async requireCompanyLead(userId: string, leadId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      throw new ForbiddenException('Create a company profile first');
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId: resolved.company.id },
      include: leadInclude,
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return { resolved, lead };
  }

  async markLeadViewed(userId: string, leadId: string) {
    const { resolved, lead } = await this.requireCompanyLead(userId, leadId);
    const isOwner = resolved.isOwner || resolved.company.ownerId === userId;

    // Owner can inspect a lead without taking it from the inbox.
    if (isOwner && !lead.assigneeId) {
      const updated = await this.prisma.lead.update({
        where: { id: leadId },
        data: { lastActorId: userId },
        include: leadInclude,
      });
      await this.crm.logActivity({
        leadId,
        userId,
        type: LeadActivityType.VIEWED,
        message: 'Owner inspected lead',
      });
      return updated;
    }

    const shouldClaim =
      !lead.assigneeId &&
      lead.status !== LeadStatus.OFFERED &&
      lead.status !== LeadStatus.SKIPPED;

    const nextStatus =
      lead.status === LeadStatus.NEW ? LeadStatus.VIEWED : lead.status;

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: nextStatus,
        lastActorId: userId,
        ...(nextStatus !== lead.status ? { statusChangedAt: new Date() } : {}),
        ...(shouldClaim ? { assigneeId: userId, claimedAt: new Date() } : {}),
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: shouldClaim ? LeadActivityType.CLAIMED : LeadActivityType.VIEWED,
      message: shouldClaim ? 'Lead claimed on view' : 'Lead viewed',
    });
    return updated;
  }

  async claimLead(userId: string, leadId: string) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    if (lead.status === LeadStatus.SKIPPED) {
      throw new BadRequestException('Cannot claim a skipped lead');
    }
    if (lead.assigneeId && lead.assigneeId !== userId) {
      throw new BadRequestException('Lead already assigned to another manager');
    }
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        assigneeId: userId,
        claimedAt: lead.claimedAt ?? new Date(),
        lastActorId: userId,
        status:
          lead.status === LeadStatus.NEW ? LeadStatus.VIEWED : lead.status,
        ...(lead.status === LeadStatus.NEW
          ? { statusChangedAt: new Date() }
          : {}),
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: LeadActivityType.CLAIMED,
      message: 'Lead claimed',
    });
    return updated;
  }

  async reassignLead(userId: string, leadId: string, assigneeId: string) {
    const { resolved, lead } = await this.requireCompanyLead(userId, leadId);
    const isOwner = resolved.isOwner || resolved.company.ownerId === userId;
    if (!isOwner) {
      throw new ForbiddenException('Only company owner can reassign leads');
    }
    if (lead.status === LeadStatus.SKIPPED) {
      throw new BadRequestException('Cannot reassign a skipped lead');
    }

    const member = await this.prisma.companyMember.findFirst({
      where: { companyId: resolved.company.id, userId: assigneeId },
    });
    const isCompanyOwner = resolved.company.ownerId === assigneeId;
    if (!member && !isCompanyOwner) {
      throw new BadRequestException('Assignee must be a company member');
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        assigneeId,
        claimedAt: new Date(),
        lastActorId: userId,
        status:
          lead.status === LeadStatus.NEW ? LeadStatus.VIEWED : lead.status,
        ...(lead.status === LeadStatus.NEW
          ? { statusChangedAt: new Date() }
          : {}),
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: LeadActivityType.REASSIGNED,
      message: 'Lead reassigned',
      meta: { assigneeId },
    });
    return updated;
  }

  async skipLead(userId: string, leadId: string) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    if (lead.status === LeadStatus.OFFERED) {
      throw new BadRequestException('Cannot skip a lead with an offer sent');
    }
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: LeadStatus.SKIPPED,
        statusChangedAt: new Date(),
        lastActorId: userId,
        assigneeId: lead.assigneeId ?? userId,
        claimedAt: lead.claimedAt ?? new Date(),
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: LeadActivityType.SKIPPED,
      message: 'Lead skipped',
    });
    return updated;
  }

  async updateStatus(userId: string, leadId: string, status: LeadStatus) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    if (lead.status === LeadStatus.OFFERED && status !== LeadStatus.OFFERED) {
      const hasOffer = await this.prisma.offer.findFirst({
        where: { requestId: lead.requestId, companyId: lead.companyId },
      });
      if (hasOffer && status !== LeadStatus.SKIPPED) {
        throw new BadRequestException(
          'Lead has an offer — only skip is allowed',
        );
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        statusChangedAt: new Date(),
        lastActorId: userId,
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: LeadActivityType.STATUS_CHANGED,
      message: `Status → ${status}`,
      meta: { from: lead.status, to: status },
    });
    return updated;
  }

  async setNextStep(userId: string, leadId: string, dto: SetNextStepDto) {
    await this.requireCompanyLead(userId, leadId);
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        nextStepText: dto.text?.trim() || null,
        nextStepAt: dto.at ? new Date(dto.at) : null,
        lastActorId: userId,
      },
      include: leadInclude,
    });
    await this.crm.logActivity({
      leadId,
      userId,
      type: LeadActivityType.NEXT_STEP_SET,
      message: dto.text?.trim() || 'Next step cleared',
      meta: { at: dto.at },
    });
    return updated;
  }

  async getActivities(userId: string, leadId: string) {
    await this.requireCompanyLead(userId, leadId);
    return this.crm.getActivities(leadId);
  }

  async getNotes(userId: string, leadId: string) {
    await this.requireCompanyLead(userId, leadId);
    return this.crm.listNotes(leadId);
  }

  async addNote(userId: string, leadId: string, body: string) {
    await this.requireCompanyLead(userId, leadId);
    return this.crm.addNote(leadId, userId, body);
  }

  async listTasks(userId: string, leadId: string) {
    await this.requireCompanyLead(userId, leadId);
    return this.crm.listTasks(leadId);
  }

  async createTask(userId: string, leadId: string, dto: CreateLeadTaskDto) {
    const { resolved, lead } = await this.requireCompanyLead(userId, leadId);
    const assigneeId = dto.assigneeId || lead.assigneeId || userId;
    await this.assertCompanyAssignee(
      resolved.company.id,
      resolved.company.ownerId,
      assigneeId,
    );
    return this.crm.createTask(leadId, lead.companyId, userId, {
      title: dto.title,
      kind: dto.kind,
      dueAt: new Date(dto.dueAt),
      assigneeId,
      description: dto.description,
      priority: dto.priority,
    });
  }

  async updateTask(
    userId: string,
    leadId: string,
    taskId: string,
    dto: UpdateLeadTaskDto,
  ) {
    const { resolved, lead } = await this.requireCompanyLead(userId, leadId);
    if (dto.assigneeId) {
      await this.assertCompanyAssignee(
        resolved.company.id,
        resolved.company.ownerId,
        dto.assigneeId,
      );
    }
    const updated = await this.crm.updateTask(taskId, lead.companyId, userId, {
      title: dto.title,
      kind: dto.kind,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      assigneeId: dto.assigneeId,
      description: dto.description,
      status: dto.status,
      priority: dto.priority,
    });
    if (!updated || updated.leadId !== leadId) {
      throw new NotFoundException('Task not found');
    }
    return updated;
  }

  async completeTask(userId: string, leadId: string, taskId: string) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    const updated = await this.crm.completeTask(taskId, lead.companyId, userId);
    if (!updated || updated.leadId !== leadId) {
      throw new NotFoundException('Task not found');
    }
    return updated;
  }

  async listMyTasks(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) return [];
    return this.crm.listMyOpenTasks(resolved.company.id, userId);
  }

  async listBoardTasks(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) return [];
    return this.crm.listCompanyTasks(resolved.company.id);
  }

  async listTaskComments(userId: string, leadId: string, taskId: string) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    return this.crm.listComments(taskId, lead.companyId);
  }

  async addTaskComment(
    userId: string,
    leadId: string,
    taskId: string,
    body: string,
  ) {
    const { lead } = await this.requireCompanyLead(userId, leadId);
    const comment = await this.crm.addComment(
      taskId,
      lead.companyId,
      userId,
      body,
    );
    if (!comment) {
      throw new NotFoundException('Task not found');
    }
    return comment;
  }

  private async assertCompanyAssignee(
    companyId: string,
    ownerId: string,
    assigneeId: string,
  ) {
    const member = await this.prisma.companyMember.findFirst({
      where: { companyId, userId: assigneeId },
    });
    if (!member && ownerId !== assigneeId) {
      throw new BadRequestException('Assignee must be a company member');
    }
  }

  async bulkUpdate(userId: string, dto: BulkLeadsDto) {
    const results = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'skip') {
          results.push(await this.skipLead(userId, id));
        } else if (dto.action === 'reassign' && dto.assigneeId) {
          results.push(await this.reassignLead(userId, id, dto.assigneeId));
        } else if (dto.action === 'status' && dto.status) {
          results.push(await this.updateStatus(userId, id, dto.status));
        }
      } catch {
        /* skip failed ids */
      }
    }
    return results;
  }
}
