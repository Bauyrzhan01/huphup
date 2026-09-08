import { Injectable } from '@nestjs/common';
import { OfferStatus, Prisma, RequestStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Hard cap for the public feed so the landing page can never pull the whole table. */
export const FEED_LIMIT = 200;

/**
 * Requests that may be shown publicly: published (non-draft) and not hidden.
 * `hiddenAt` marks a request the buyer deleted — it must never reach the landing page.
 */
const publicRequestWhere: Prisma.RequestWhereInput = {
  status: { not: RequestStatus.DRAFT },
  hiddenAt: null,
};

type FlowPhase = 'idle' | 'processing' | 'delivery';

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
      feedRequests,
      feedTotal,
      cityGroups,
      acceptedTotal,
    ] = await Promise.all([
      this.prisma.request.count({
        where: { ...publicRequestWhere, createdAt: { gte: sinceDay } },
      }),
      this.prisma.offer.count({ where: { createdAt: { gte: sinceDay } } }),
      this.prisma.company.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: { lastSeenAt: { gte: onlineSince }, role: UserRole.SUPPLIER },
      }),
      this.prisma.request.findMany({
        where: publicRequestWhere,
        orderBy: { createdAt: 'desc' },
        take: FEED_LIMIT,
        select: {
          id: true,
          code: true,
          title: true,
          city: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.request.count({ where: publicRequestWhere }),
      this.prisma.request.groupBy({
        by: ['city'],
        where: { ...publicRequestWhere, city: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.offer.count({ where: { status: OfferStatus.ACCEPTED } }),
    ]);

    const feed = feedRequests.map((row) => ({
      id: row.id,
      kind: 'request' as const,
      code: row.code,
      label: clipTitle(row.title),
      city: row.city,
      status: row.status,
      at: row.createdAt.toISOString(),
    }));

    const cities = cityGroups
      .filter((row) => row.city?.trim())
      .map((row) => ({
        name: row.city!.trim(),
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const pulse = feed[0] ?? null;

    const activeRequest = await this.prisma.request.findFirst({
      where: {
        hiddenAt: null,
        status: {
          in: [RequestStatus.PUBLISHED, RequestStatus.IN_PROGRESS],
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

    const [acceptedOffers, supplierCompanies] = activeRequest
      ? await Promise.all([
          this.prisma.offer.findMany({
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
          }),
          this.prisma.company.findMany({
            where: { city: { not: null } },
            orderBy: { updatedAt: 'desc' },
            take: 12,
            select: { city: true },
          }),
        ])
      : [[], []];

    const flowPhase: FlowPhase = !activeRequest
      ? 'idle'
      : activeRequest.status === RequestStatus.IN_PROGRESS ||
          acceptedOffers.length > 0
        ? 'delivery'
        : 'processing';

    const originKey = activeRequest?.city?.trim().toLowerCase() ?? '';
    let deliveryCities = [
      ...new Set(
        [
          ...acceptedOffers.map((row) => row.company.city?.trim()),
          ...supplierCompanies.map((row) => row.city?.trim()),
        ].filter((city): city is string => Boolean(city)),
      ),
    ]
      .filter((city) => city.toLowerCase() !== originKey)
      .slice(0, 5);

    // Always fan out from hub so the map shows request → HupHup → suppliers
    if (activeRequest && deliveryCities.length === 0) {
      deliveryCities = ['Астана', 'Шымкент', 'Караганда', 'Актау'].filter(
        (city) => city.toLowerCase() !== originKey,
      );
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
      feedTotal,
      feedLimit: FEED_LIMIT,
      cities,
      pulse,
      flow: activeRequest
        ? {
            phase: flowPhase,
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
