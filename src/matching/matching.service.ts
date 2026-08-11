import { ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { GeminiService } from '../gemini/gemini.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly gemini: GeminiService,
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

    const requestText =
      request.rawText?.trim() ||
      `${request.title}\n${request.description}`.trim();

    let matches = await this.gemini.matchProducts({
      requestText,
      title: request.title,
      category: request.category,
      city: request.city,
      products,
    });

    if (!matches.length) {
      this.logger.log(
        'Gemini returned no matches; falling back to keyword product match',
      );
      matches = this.keywordMatch(requestText, request, products);
    }

    // Strict mode: only suppliers Gemini (or keyword fallback) found
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
        },
        update: { score: item.score },
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
    const hay = `${requestText} ${request.category ?? ''} ${request.city ?? ''}`.toLowerCase();
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

    return [...byCompany.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  }

  async listLeadsForSupplier(userId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      return [];
    }

    return this.prisma.lead.findMany({
      where: { companyId: resolved.company.id },
      orderBy: [{ status: 'asc' }, { score: 'desc' }, { createdAt: 'desc' }],
      include: {
        request: {
          select: {
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
          },
        },
      },
    });
  }

  async markLeadViewed(userId: string, leadId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      return null;
    }
    return this.prisma.lead.updateMany({
      where: { id: leadId, companyId: resolved.company.id },
      data: { status: 'VIEWED' },
    });
  }

  async skipLead(userId: string, leadId: string) {
    const resolved = await this.companies.resolveCompanyForUser(userId);
    if (!resolved) {
      throw new ForbiddenException('Create a company profile first');
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId: resolved.company.id },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (lead.status === 'OFFERED') {
      throw new BadRequestException('Cannot skip a lead with an offer sent');
    }
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'SKIPPED' },
      include: {
        request: {
          select: {
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
          },
        },
      },
    });
  }
}
