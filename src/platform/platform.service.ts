import { Injectable } from '@nestjs/common';
import { OfferStatus, RequestStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async live() {
    const sinceDay = new Date();
    sinceDay.setUTCHours(0, 0, 0, 0);
    const onlineSince = new Date(Date.now() - 90_000);

    const [
      requestsToday,
      offersToday,
      companies,
      products,
      online,
      recentRequests,
      recentOffers,
      recentCompanies,
      cityGroups,
      acceptedTotal,
    ] = await Promise.all([
      this.prisma.request.count({
        where: {
          createdAt: { gte: sinceDay },
          status: { not: RequestStatus.DRAFT },
        },
      }),
      this.prisma.offer.count({ where: { createdAt: { gte: sinceDay } } }),
      this.prisma.company.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: { lastSeenAt: { gte: onlineSince }, role: UserRole.SUPPLIER },
      }),
      this.prisma.request.findMany({
        where: {
          status: {
            in: [
              RequestStatus.PUBLISHED,
              RequestStatus.IN_PROGRESS,
              RequestStatus.CLOSED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          code: true,
          title: true,
          city: true,
          createdAt: true,
        },
      }),
      this.prisma.offer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          status: true,
          createdAt: true,
          request: { select: { code: true, title: true, city: true } },
        },
      }),
      this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, city: true, createdAt: true },
      }),
      this.prisma.request.groupBy({
        by: ['city'],
        where: {
          status: {
            in: [RequestStatus.PUBLISHED, RequestStatus.IN_PROGRESS],
          },
          city: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.offer.count({ where: { status: OfferStatus.ACCEPTED } }),
    ]);

    const feed = [
      ...recentRequests.map((row) => ({
        id: row.id,
        kind: 'request' as const,
        code: row.code,
        label: clipTitle(row.title),
        city: row.city,
        at: row.createdAt.toISOString(),
      })),
      ...recentOffers.map((row) => ({
        id: row.id,
        kind: 'offer' as const,
        code: row.request.code,
        label: clipTitle(row.request.title),
        city: row.request.city,
        status: row.status,
        at: row.createdAt.toISOString(),
      })),
      ...recentCompanies.map((row) => ({
        id: row.id,
        kind: 'company' as const,
        code: null,
        label: row.name,
        city: row.city,
        at: row.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    const cities = cityGroups
      .filter((row) => row.city?.trim())
      .map((row) => ({
        name: row.city!.trim(),
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const pulse = feed.find((item) => item.kind === 'request') ?? feed[0] ?? null;

    const activeRequest = await this.prisma.request.findFirst({
      where: {
        status: {
          in: [
            RequestStatus.PUBLISHED,
            RequestStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        code: true,
        title: true,
        city: true,
        status: true,
        updatedAt: true,
      },
    });

    const acceptedOffers = activeRequest
      ? await this.prisma.offer.findMany({
          where: {
            requestId: activeRequest.id,
            status: OfferStatus.ACCEPTED,
          },
          orderBy: { updatedAt: 'desc' },
          take: 4,
          select: {
            id: true,
            company: { select: { city: true } },
          },
        })
      : [];

    const flowPhase = !activeRequest
      ? 'idle'
      : activeRequest.status === RequestStatus.IN_PROGRESS ||
          acceptedOffers.length > 0
        ? 'delivery'
        : 'processing';

    let deliveryCities = [
      ...new Set(
        acceptedOffers
          .map((row) => row.company.city?.trim())
          .filter((city): city is string => Boolean(city)),
      ),
    ].slice(0, 4);

    if (deliveryCities.length === 0 && flowPhase === 'delivery') {
      deliveryCities = ['Астана', 'Шымкент'];
    }

    return {
      checkedAt: new Date().toISOString(),
      stats: {
        requestsToday,
        offersToday,
        companies,
        products,
        online,
        acceptedTotal,
      },
      feed,
      cities,
      pulse,
      flow: activeRequest
        ? {
            phase: flowPhase as 'idle' | 'processing' | 'delivery',
            code: activeRequest.code,
            label: clipTitle(activeRequest.title),
            originCity: activeRequest.city,
            deliveryCities,
            updatedAt: activeRequest.updatedAt.toISOString(),
          }
        : null,
    };
  }
}

function clipTitle(value: string) {
  const line = value.split('\n')[0]?.trim() ?? value.trim();
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}
