import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Banner,
  BannerAudience,
  BannerPlacement,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  ActiveBannersQueryDto,
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/banner.dto';

const MAX_ACTIVE = 10;

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** What the app shows right now to a given viewer; viewerEmail may be absent for guests. */
  listActive(
    query: ActiveBannersQueryDto,
    viewerEmail?: string,
    now = new Date(),
  ) {
    const where: Prisma.BannerWhereInput = {
      isActive: true,
      placement: query.placement ?? BannerPlacement.CARD,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        // A banner with neither a picture nor a title would be an empty card.
        { OR: [{ imageUrl: { not: null } }, { title: { not: null } }] },
        // A banner under test is visible only to the accounts listed on it.
        {
          OR: [
            { testEmails: { isEmpty: true } },
            ...(viewerEmail ? [{ testEmails: { has: viewerEmail } }] : []),
          ],
        },
      ],
    };
    if (query.audience) {
      where.audience = { in: [BannerAudience.ALL, query.audience] };
    }
    const city = query.city?.trim();
    if (city) {
      (where.AND as Prisma.BannerWhereInput[]).push({
        OR: [{ cities: { isEmpty: true } }, { cities: { has: city } }],
      });
    }
    return this.prisma.banner.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: MAX_ACTIVE,
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        bgColor: true,
        ctaText: true,
        ctaUrl: true,
      },
    });
  }

  listAll() {
    return this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateBannerDto) {
    assertWindow(dto.startsAt, dto.endsAt);
    return this.prisma.banner.create({
      data: {
        ...dto,
        cities: normalizeCities(dto.cities),
        testEmails: normalizeEmails(dto.testEmails),
      },
    });
  }

  async update(id: string, dto: UpdateBannerDto) {
    const current = await this.require(id);
    assertWindow(
      dto.startsAt === undefined ? current.startsAt : dto.startsAt,
      dto.endsAt === undefined ? current.endsAt : dto.endsAt,
    );
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.cities ? { cities: normalizeCities(dto.cities) } : {}),
        ...(dto.testEmails
          ? { testEmails: normalizeEmails(dto.testEmails) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    const banner = await this.require(id);
    await this.prisma.banner.delete({ where: { id } });
    await this.dropImage(banner);
    return { ok: true };
  }

  async uploadImage(id: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }
    const banner = await this.require(id);
    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: `banners/${id}`,
    });
    const updated = await this.prisma.banner.update({
      where: { id },
      data: { imageUrl: uploaded.url, imageKey: uploaded.key },
    });
    if (banner.imageKey !== uploaded.key) await this.dropImage(banner);
    return updated;
  }

  async removeImage(id: string) {
    const banner = await this.require(id);
    const updated = await this.prisma.banner.update({
      where: { id },
      data: { imageUrl: null, imageKey: null },
    });
    await this.dropImage(banner);
    return updated;
  }

  private async require(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  private async dropImage(banner: Banner) {
    if (!banner.imageKey) return;
    await this.storage.delete(banner.imageKey).catch(() => undefined);
  }
}

function normalizeCities(cities: string[] | undefined) {
  if (!cities) return [];
  return [...new Set(cities.map((c) => c.trim()).filter(Boolean))];
}

// Logins are lower-cased, so the stored test emails must be too.
function normalizeEmails(emails: string[] | undefined) {
  if (!emails) return [];
  return [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
}

function assertWindow(startsAt?: Date | null, endsAt?: Date | null) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new BadRequestException('endsAt must be after startsAt');
  }
}
