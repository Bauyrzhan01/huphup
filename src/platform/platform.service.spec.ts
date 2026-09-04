import { RequestStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { FEED_LIMIT, PlatformService } from './platform.service';

type QueryArgs = { where?: Record<string, unknown>; take?: number };

function buildPrisma() {
  return {
    request: {
      count: jest.fn((args: QueryArgs) =>
        Promise.resolve(args?.where?.createdAt ? 3 : 42),
      ),
      findMany: jest.fn((_args: QueryArgs) =>
        Promise.resolve([
          {
            id: 'r1',
            code: 'REQ-1',
            title: 'Цемент М400\nвторая строка',
            city: 'Алматы',
            status: RequestStatus.PUBLISHED,
            createdAt: new Date('2026-09-01T10:00:00Z'),
          },
        ]),
      ),
      groupBy: jest.fn((_args: QueryArgs) =>
        Promise.resolve([
          { city: 'Алматы', _count: { _all: 2 } },
          { city: 'Астана', _count: { _all: 5 } },
        ]),
      ),
      findFirst: jest.fn((_args: QueryArgs) => Promise.resolve(null)),
    },
    offer: { count: jest.fn(() => Promise.resolve(1)) },
    company: { count: jest.fn(() => Promise.resolve(4)), findMany: jest.fn() },
    product: { count: jest.fn(() => Promise.resolve(9)) },
    user: { count: jest.fn(() => Promise.resolve(2)) },
  };
}

describe('PlatformService.live', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PlatformService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new PlatformService(prisma as unknown as PrismaService);
  });

  it('never exposes requests the buyer hid', async () => {
    await service.live();

    const queries: QueryArgs[] = [
      ...prisma.request.count.mock.calls.map(([args]) => args),
      ...prisma.request.findMany.mock.calls.map(([args]) => args),
      ...prisma.request.groupBy.mock.calls.map(([args]) => args),
      ...prisma.request.findFirst.mock.calls.map(([args]) => args),
    ];

    expect(queries).toHaveLength(5);
    for (const query of queries) {
      expect(query.where).toMatchObject({ hiddenAt: null });
    }
  });

  it('excludes drafts from the public feed', async () => {
    await service.live();
    const [args] = prisma.request.findMany.mock.calls[0];
    expect(args.where).toMatchObject({
      status: { not: RequestStatus.DRAFT },
      hiddenAt: null,
    });
  });

  it('caps the feed instead of reading the whole table', async () => {
    const result = await service.live();
    const [args] = prisma.request.findMany.mock.calls[0];
    expect(args.take).toBe(FEED_LIMIT);
    expect(result.feedLimit).toBe(FEED_LIMIT);
    expect(result.feedTotal).toBe(42);
  });

  it('clips multi-line titles and sorts cities by volume', async () => {
    const result = await service.live();
    expect(result.feed[0].label).toBe('Цемент М400');
    expect(result.cities.map((c) => c.name)).toEqual(['Астана', 'Алматы']);
    expect(result.pulse?.code).toBe('REQ-1');
    expect(result.flow).toBeNull();
  });

  it('reports today stats and the accepted-offer total', async () => {
    const result = await service.live();
    expect(result.stats.requestsToday).toBe(3);
    expect(result.stats.companies).toBe(4);
    expect(result.stats.products).toBe(9);
    expect(result.stats.online).toBe(2);
  });
});
