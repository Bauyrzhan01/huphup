import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
  ) {}

  private async getMemberCompany(userId: string) {
    const resolved = await this.companies.requireCompanyForUser(userId);
    return resolved.company;
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

  async listMine(userId: string) {
    const company = await this.getMemberCompany(userId);
    return this.prisma.product.findMany({
      where: { companyId: company.id },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateProductDto) {
    const company = await this.getMemberCompany(userId);
    return this.prisma.product.create({
      data: {
        companyId: company.id,
        name: dto.name,
        description: dto.description,
        unit: dto.unit,
        priceFrom: dto.priceFrom,
        currency: dto.currency ?? 'KZT',
        city: dto.city ?? company.city,
      },
    });
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    await this.getOwnedProduct(userId, productId);
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Nothing to update');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.priceFrom !== undefined ? { priceFrom: dto.priceFrom } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(userId: string, productId: string) {
    await this.getOwnedProduct(userId, productId);
    await this.prisma.product.delete({ where: { id: productId } });
    return { ok: true };
  }

  async listActiveCatalog(limit = 500) {
    return this.prisma.product.findMany({
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

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
