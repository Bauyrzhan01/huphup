import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Banner, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { BannersService } from './banners.service';

function banner(over: Partial<Banner> = {}): Banner {
  return {
    id: 'b1',
    title: 'Скидка',
    subtitle: null,
    imageUrl: null,
    imageKey: null,
    bgColor: '#111111',
    ctaText: null,
    ctaUrl: null,
    audience: 'ALL',
    cities: [],
    isActive: true,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...over,
  };
}

function build() {
  const prisma = {
    banner: {
      findMany: jest.fn<
        Promise<Banner[]>,
        [{ where: Prisma.BannerWhereInput }]
      >(() => Promise.resolve([])),
      findUnique: jest.fn().mockResolvedValue(banner()),
      create: jest.fn((args: { data: { cities?: string[] } }) =>
        Promise.resolve(args.data),
      ),
      update: jest.fn((args: { data: object }) => Promise.resolve(args.data)),
      delete: jest.fn().mockResolvedValue(banner()),
    },
  };
  const storage = {
    upload: jest
      .fn()
      .mockResolvedValue({ key: 'db:new', url: '/api/v1/media/new' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BannersService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
  return { service, prisma, storage };
}

function whereOf(prisma: ReturnType<typeof build>['prisma']) {
  const where = prisma.banner.findMany.mock.calls[0][0].where;
  return where as Prisma.BannerWhereInput & { AND: Prisma.BannerWhereInput[] };
}

describe('BannersService.listActive', () => {
  const now = new Date('2026-09-22T10:00:00Z');

  it('показывает только активные баннеры внутри окна показа', async () => {
    const { service, prisma } = build();
    await service.listActive({}, now);
    const where = whereOf(prisma);
    expect(where.isActive).toBe(true);
    expect(where.AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ]);
    expect(where.audience).toBeUndefined();
  });

  it('покупателю отдаёт баннеры «всем» и «покупателям»', async () => {
    const { service, prisma } = build();
    await service.listActive({ audience: 'BUYER' }, now);
    const where = whereOf(prisma);
    expect(where.audience).toEqual({ in: ['ALL', 'BUYER'] });
  });

  it('по городу берёт баннеры без городов и с этим городом', async () => {
    const { service, prisma } = build();
    await service.listActive({ city: ' Алматы ' }, now);
    const where = whereOf(prisma);
    expect(where.AND[2]).toEqual({
      OR: [{ cities: { isEmpty: true } }, { cities: { has: 'Алматы' } }],
    });
  });
});

describe('BannersService.create / update', () => {
  it('чистит список городов от пробелов и повторов', async () => {
    const { service, prisma } = build();
    await service.create({
      title: 'А',
      cities: [' Алматы', 'Алматы', '', 'Астана'],
    });
    expect(prisma.banner.create.mock.calls[0][0].data.cities).toEqual([
      'Алматы',
      'Астана',
    ]);
  });

  it('не даёт закончить показ раньше начала', async () => {
    const { service } = build();
    await expect(
      service.create({
        title: 'А',
        startsAt: new Date('2026-10-01'),
        endsAt: new Date('2026-09-01'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('при правке сверяет новую дату окончания с уже сохранённым началом', async () => {
    const { service, prisma } = build();
    prisma.banner.findUnique.mockResolvedValue(
      banner({ startsAt: new Date('2026-10-01') }),
    );
    await expect(
      service.update('b1', { endsAt: new Date('2026-09-15') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('несуществующий баннер — 404', async () => {
    const { service, prisma } = build();
    prisma.banner.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { title: 'Б' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('BannersService.uploadImage', () => {
  const file = (mimetype: string) =>
    ({
      buffer: Buffer.from('x'),
      mimetype,
      originalname: 'a.png',
    }) as Express.Multer.File;

  it('принимает только картинки', async () => {
    const { service } = build();
    await expect(
      service.uploadImage('b1', file('application/pdf')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('заменяет картинку и удаляет старый файл', async () => {
    const { service, prisma, storage } = build();
    prisma.banner.findUnique.mockResolvedValue(banner({ imageKey: 'db:old' }));
    await service.uploadImage('b1', file('image/png'));
    expect(prisma.banner.update.mock.calls[0][0].data).toEqual({
      imageUrl: '/api/v1/media/new',
      imageKey: 'db:new',
    });
    expect(storage.delete).toHaveBeenCalledWith('db:old');
  });
});
