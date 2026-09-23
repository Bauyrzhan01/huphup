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
    placement: 'CARD',
    testEmails: [],
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
      create: jest.fn(
        (args: { data: { cities?: string[]; testEmails?: string[] } }) =>
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
    await service.listActive({}, undefined, now);
    const where = whereOf(prisma);
    expect(where.isActive).toBe(true);
    expect(where.AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      { OR: [{ imageUrl: { not: null } }, { title: { not: null } }] },
      { OR: [{ testEmails: { isEmpty: true } }] },
    ]);
    expect(where.audience).toBeUndefined();
    expect(where.placement).toBe('CARD');
  });

  it('не отдаёт пустые баннеры — без картинки и без заголовка', async () => {
    const { service, prisma } = build();
    await service.listActive({}, undefined, now);
    expect(whereOf(prisma).AND).toContainEqual({
      OR: [{ imageUrl: { not: null } }, { title: { not: null } }],
    });
  });

  it('покупателю отдаёт баннеры «всем» и «покупателям»', async () => {
    const { service, prisma } = build();
    await service.listActive({ audience: 'BUYER' }, undefined, now);
    const where = whereOf(prisma);
    expect(where.audience).toEqual({ in: ['ALL', 'BUYER'] });
  });

  it('по умолчанию отдаёт карточки, pop-up — только по запросу', async () => {
    const { service, prisma } = build();
    await service.listActive({ placement: 'POPUP' }, undefined, now);
    expect(whereOf(prisma).placement).toBe('POPUP');
  });

  it('тестовый баннер виден только своим адресатам', async () => {
    const { service, prisma } = build();
    await service.listActive({}, 'tester@huphup.kz', now);
    expect(whereOf(prisma).AND).toContainEqual({
      OR: [
        { testEmails: { isEmpty: true } },
        { testEmails: { has: 'tester@huphup.kz' } },
      ],
    });
  });

  it('гостю тестовые баннеры не показываются', async () => {
    const { service, prisma } = build();
    await service.listActive({}, undefined, now);
    expect(whereOf(prisma).AND).toContainEqual({
      OR: [{ testEmails: { isEmpty: true } }],
    });
  });

  it('по городу берёт баннеры без городов и с этим городом', async () => {
    const { service, prisma } = build();
    await service.listActive({ city: ' Алматы ' }, undefined, now);
    const where = whereOf(prisma);
    expect(where.AND).toContainEqual({
      OR: [{ cities: { isEmpty: true } }, { cities: { has: 'Алматы' } }],
    });
  });
});

describe('BannersService.create / update', () => {
  it('создаёт баннер без заголовка — текст бывает прямо на картинке', async () => {
    const { service, prisma } = build();
    await service.create({ audience: 'BUYER' });
    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

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

  it('приводит тестовые email к нижнему регистру и убирает повторы', async () => {
    const { service, prisma } = build();
    await service.create({
      title: 'А',
      testEmails: [' Tester@Huphup.KZ ', 'tester@huphup.kz', 'two@huphup.kz'],
    });
    expect(prisma.banner.create.mock.calls[0][0].data.testEmails).toEqual([
      'tester@huphup.kz',
      'two@huphup.kz',
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
