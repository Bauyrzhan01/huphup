import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async createLeadsForRequest(requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      return [];
    }

    const companies = await this.prisma.company.findMany({
      take: 100,
    });

    const scored = companies
      .map((company) => {
        let score = 0;
        if (
          request.city &&
          company.city &&
          company.city.toLowerCase() === request.city.toLowerCase()
        ) {
          score += 40;
        }
        if (
          request.category &&
          company.categories.some(
            (c) => c.toLowerCase() === request.category!.toLowerCase(),
          )
        ) {
          score += 40;
        }
        if (company.verified) score += 10;
        score += Math.min(company.rating, 5) * 2;
        return { company, score };
      })
      .filter((x) => x.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const created: { leadId: string; ownerId: string; score: number }[] = [];

    for (const item of scored) {
      const lead = await this.prisma.lead.upsert({
        where: {
          requestId_companyId: {
            requestId,
            companyId: item.company.id,
          },
        },
        create: {
          requestId,
          companyId: item.company.id,
          score: item.score,
        },
        update: { score: item.score },
      });
      created.push({
        leadId: lead.id,
        ownerId: item.company.ownerId,
        score: item.score,
      });
    }

    return created;
  }

  async listLeadsForSupplier(userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
    });
    if (!company) {
      return [];
    }

    return this.prisma.lead.findMany({
      where: { companyId: company.id },
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
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
    });
    if (!company) {
      return null;
    }
    return this.prisma.lead.updateMany({
      where: { id: leadId, companyId: company.id },
      data: { status: 'VIEWED' },
    });
  }
}
