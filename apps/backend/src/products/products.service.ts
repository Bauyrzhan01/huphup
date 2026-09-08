import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { GeminiService, GeminiProductDraft } from '../gemini/gemini.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateProductDto,
  ProductDraftDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CreateProductReviewDto } from './dto/review.dto';
import { toDisplayText } from '../common/text.util';

const MAX_IMAGES_PER_PRODUCT = 10;
const IMAGE_MIME_PREFIX = 'image/';

function uniqueSorted(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.map((v) => v?.trim()).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
}

type ReviewStats = {
  avgRating: number | null;
  reviewCount: number;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompaniesService))
    private readonly companies: CompaniesService,
    private readonly gemini: GeminiService,
    private readonly storage: StorageService,
  ) {}

  private async getMemberCompany(userId: string) {
    const resolved = await this.companies.requireCompanyForUser(userId);
    return resolved.company;
  }

  async directoryMeta() {
    const [companies, products] = await Promise.all([
      this.prisma.company.findMany({
        select: { city: true, categories: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { city: true, unit: true },
      }),
    ]);
    return {
      cities: uniqueSorted([
        ...companies.map((c) => c.city),
        ...products.map((p) => p.city),
      ]),
      categories: uniqueSorted(companies.flatMap((c) => c.categories)),
      units: uniqueSorted(products.map((p) => p.unit)),
    };
  }

  private async getOwnedProduct(userId: string, productId: string) {
    const company = await this.getMemberCompany(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: company.id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { company, product };
  }

  private async reviewStatsForProducts(
    productIds: string[],
  ): Promise<Map<string, ReviewStats>> {
    if (!productIds.length) return new Map();
    const rows = await this.prisma.productReview.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return new Map(
      rows.map((r) => [
        r.productId,
        {
          avgRating:
            r._avg.rating != null ? Math.round(r._avg.rating * 10) / 10 : null,
          reviewCount: r._count.rating,
        },
      ]),
    );
  }

  private mapProduct<
    T extends { id: string; priceFrom?: unknown; currency?: unknown },
  >(
    product: T,
    stats: Map<string, ReviewStats>,
    images?: { id: string; url: string; sortOrder: number }[],
  ) {
    const s = stats.get(product.id) ?? { avgRating: null, reviewCount: 0 };
    const {
      priceFrom,
      currency,
      images: _images,
      ...rest
    } = product as T & {
      images?: unknown;
    };
    return {
      ...rest,
      priceFrom: priceFrom == null ? null : toDisplayText(priceFrom),
      currency: currency == null ? 'KZT' : toDisplayText(currency, 'KZT'),
      images: images ?? [],
      avgRating: s.avgRating,
      reviewCount: s.reviewCount,
    };
  }

  async listMine(userId: string) {
    const company = await this.getMemberCompany(userId);
    const products = await this.prisma.product.findMany({
      where: { companyId: company.id },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const stats = await this.reviewStatsForProducts(products.map((p) => p.id));
    return products.map((p) =>
      this.mapProduct(
        p,
        stats,
        p.images.map(({ id, url, sortOrder }) => ({ id, url, sortOrder })),
      ),
    );
  }

  /**
   * Turns a supplier's rough notes into a suggested listing (name,
   * description, unit, category) for the frontend to prefill — never
   * applied silently, the supplier still reviews and saves it themselves.
   * Falls back to a trivial, honest draft if Gemini is unavailable, so the
   * button never just breaks.
   */
  async aiDraft(
    userId: string,
    dto: ProductDraftDto,
  ): Promise<GeminiProductDraft> {
    const company = await this.getMemberCompany(userId);
    const draft = await this.gemini.writeProductDraft({
      text: dto.text,
      city: company.city,
    });
    if (draft) return draft;

    const firstLine = dto.text.split('\n')[0]?.trim() ?? dto.text.trim();
    return {
      name: firstLine.slice(0, 80) || 'Новый товар',
      description: dto.text.trim().slice(0, 2000),
      unit: '',
      category: '',
    };
  }

  async create(userId: string, dto: CreateProductDto) {
    const company = await this.getMemberCompany(userId);
    const product = await this.prisma.product.create({
      data: {
        companyId: company.id,
        name: dto.name,
        description: dto.description,
        unit: dto.unit,
        city: dto.city ?? company.city,
      },
      include: { images: true },
    });
    return this.mapProduct(product, new Map(), []);
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    await this.getOwnedProduct(userId, productId);
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Nothing to update');
    }
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    const stats = await this.reviewStatsForProducts([product.id]);
    return this.mapProduct(
      product,
      stats,
      product.images.map(({ id, url, sortOrder }) => ({ id, url, sortOrder })),
    );
  }

  async remove(userId: string, productId: string) {
    const { product } = await this.getOwnedProduct(userId, productId);
    const images = await this.prisma.productImage.findMany({
      where: { productId: product.id },
    });
    await this.prisma.product.delete({ where: { id: productId } });
    await Promise.all(
      images.map((img) =>
        this.storage.delete(img.storageKey).catch(() => undefined),
      ),
    );
    return { ok: true };
  }

  async getPublicById(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        company: {
          select: {
            id: true,
            name: true,
            city: true,
            verified: true,
            rating: true,
            bin: true,
            description: true,
            categories: true,
            logoUrl: true,
            createdAt: true,
            owner: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const stats = await this.reviewStatsForProducts([product.id]);
    return this.mapProduct(
      product,
      stats,
      product.images.map(({ id, url, sortOrder }) => ({ id, url, sortOrder })),
    );
  }

  async uploadImage(
    userId: string,
    productId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (!file.mimetype?.startsWith(IMAGE_MIME_PREFIX)) {
      throw new BadRequestException('Only image files are allowed');
    }
    await this.getOwnedProduct(userId, productId);
    const count = await this.prisma.productImage.count({
      where: { productId },
    });
    if (count >= MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Maximum ${MAX_IMAGES_PER_PRODUCT} images per product`,
      );
    }

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: `products/${productId}`,
    });

    return this.prisma.productImage.create({
      data: {
        productId,
        url: uploaded.url,
        storageKey: uploaded.key,
        sortOrder: count,
      },
    });
  }

  async removeImage(userId: string, productId: string, imageId: string) {
    await this.getOwnedProduct(userId, productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage.delete(image.storageKey).catch(() => undefined);
    return { ok: true };
  }

  async listReviews(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true } },
      },
    });
  }

  async upsertReview(
    userId: string,
    productId: string,
    dto: CreateProductReviewDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true, companyId: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const membership = await this.companies.resolveCompanyForUser(userId);
    if (membership?.company.id === product.companyId) {
      throw new ForbiddenException('Cannot review your own product');
    }

    return this.prisma.productReview.upsert({
      where: { productId_userId: { productId, userId } },
      create: {
        productId,
        userId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      update: {
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      include: {
        user: { select: { id: true, fullName: true } },
      },
    });
  }

  async enrichPublicProducts<
    T extends {
      id: string;
      name: string;
      description: string | null;
      unit: string | null;
      city: string | null;
    },
  >(items: T[]) {
    if (!items.length) return [];
    const ids = items.map((p) => p.id);
    const [images, stats] = await Promise.all([
      this.prisma.productImage.findMany({
        where: { productId: { in: ids } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.reviewStatsForProducts(ids),
    ]);
    const imagesByProduct = new Map<
      string,
      { id: string; url: string; sortOrder: number }[]
    >();
    for (const img of images) {
      const list = imagesByProduct.get(img.productId) ?? [];
      list.push({ id: img.id, url: img.url, sortOrder: img.sortOrder });
      imagesByProduct.set(img.productId, list);
    }
    return items.map((p) =>
      this.mapProduct(p, stats, imagesByProduct.get(p.id) ?? []),
    );
  }

  async listActiveCatalog(limit = 500) {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: limit,
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
    const enriched = await this.enrichPublicProducts(products);
    return enriched.map((p, i) => ({ ...p, company: products[i].company }));
  }

  async listPublicCatalog(params: {
    q?: string;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = {
      isActive: true,
      ...(params.city
        ? { city: { contains: params.city, mode: 'insensitive' as const } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' as const } },
              {
                description: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
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
      }),
      this.prisma.product.count({ where }),
    ]);

    const enriched = await this.enrichPublicProducts(items);
    const merged = enriched.map((p, i) => ({
      ...p,
      company: items[i].company,
    }));

    return {
      items: merged,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
