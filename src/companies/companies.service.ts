import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, role: string, dto: CreateCompanyDto) {
    if (role !== UserRole.SUPPLIER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only suppliers can create a company');
    }

    const existing = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (existing) {
      throw new ConflictException('Company already exists for this user');
    }

    return this.prisma.company.create({
      data: {
        ownerId,
        name: dto.name,
        bin: dto.bin,
        city: dto.city,
        description: dto.description,
        categories: dto.categories ?? [],
        members: {
          create: { userId: ownerId, title: 'Owner' },
        },
      },
    });
  }

  async list(params: { city?: string; q?: string }) {
    return this.prisma.company.findMany({
      where: {
        ...(params.city ? { city: { contains: params.city, mode: 'insensitive' } } : {}),
        ...(params.q
          ? {
              OR: [
                { name: { contains: params.q, mode: 'insensitive' } },
                { description: { contains: params.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
      take: 50,
    });
  }

  async getById(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async update(userId: string, companyId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    if (company.ownerId !== userId) {
      throw new ForbiddenException('Not company owner');
    }
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Nothing to update');
    }
    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }

  async getMyCompany(userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }
}
