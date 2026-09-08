import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CompanyMemberRole, NotificationType, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { StorageService } from '../storage/storage.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { CreateInviteDto } from './dto/invite.dto';

const IMAGE_MIME_PREFIX = 'image/';

type CompanyAvatarSource = {
  logoUrl?: string | null;
  owner?: { avatarUrl?: string | null } | null;
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProductsService))
    private readonly products: ProductsService,
    private readonly storage: StorageService,
  ) {}

  private withAvatar<T extends CompanyAvatarSource>(company: T) {
    return {
      ...company,
      avatarUrl: company.logoUrl || company.owner?.avatarUrl || null,
    };
  }

  /** Resolve company via membership first, then owned company (legacy). */
  async resolveCompanyForUser(userId: string) {
    const membership = await this.prisma.companyMember.findUnique({
      where: { userId },
      include: { company: true },
    });
    if (membership) {
      return {
        company: membership.company,
        membership,
        isOwner: membership.role === CompanyMemberRole.OWNER,
      };
    }

    const owned = await this.prisma.company.findUnique({
      where: { ownerId: userId },
    });
    if (!owned) {
      return null;
    }
    return {
      company: owned,
      membership: null,
      isOwner: true,
    };
  }

  async ensureSupplierCompany(userId: string) {
    const existing = await this.resolveCompanyForUser(userId);
    if (existing) {
      if (!existing.membership && existing.isOwner) {
        await this.prisma.companyMember.upsert({
          where: { userId },
          create: {
            userId,
            companyId: existing.company.id,
            title: 'Owner',
            role: CompanyMemberRole.OWNER,
          },
          update: {},
        });
      }
      await this.prisma.user.updateMany({
        where: { id: userId, role: { not: UserRole.ADMIN } },
        data: { role: UserRole.SUPPLIER },
      });
      return (await this.resolveCompanyForUser(userId)) ?? existing;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, role: true },
    });
    if (!user || user.role === UserRole.ADMIN) {
      return null;
    }

    const name = user.fullName.trim() || user.email.split('@')[0];
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.company.create({
          data: {
            ownerId: userId,
            name,
            members: {
              create: {
                userId,
                title: 'Owner',
                role: CompanyMemberRole.OWNER,
              },
            },
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { role: UserRole.SUPPLIER },
        });
      });
    } catch {
      const raced = await this.resolveCompanyForUser(userId);
      if (raced) {
        await this.prisma.user.updateMany({
          where: { id: userId, role: { not: UserRole.ADMIN } },
          data: { role: UserRole.SUPPLIER },
        });
        return raced;
      }
      throw new ForbiddenException('Supplier company membership required');
    }

    return this.resolveCompanyForUser(userId);
  }

  async requireCompanyForUser(userId: string) {
    const resolved = await this.resolveCompanyForUser(userId);
    if (!resolved) {
      throw new NotFoundException('Company not found');
    }
    return resolved;
  }

  async requireOwner(userId: string) {
    const resolved = await this.requireCompanyForUser(userId);
    if (!resolved.isOwner && resolved.company.ownerId !== userId) {
      throw new ForbiddenException('Only company owner can do this');
    }
    return resolved;
  }

  async listMemberUserIds(companyId: string) {
    const members = await this.prisma.companyMember.findMany({
      where: { companyId },
      select: { userId: true },
    });
    if (members.length > 0) {
      return [...new Set(members.map((m) => m.userId))];
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerId: true },
    });
    return company ? [company.ownerId] : [];
  }

  async create(ownerId: string, _role: string, dto: CreateCompanyDto) {
    const alreadyMember = await this.prisma.companyMember.findUnique({
      where: { userId: ownerId },
    });
    if (alreadyMember) {
      throw new ConflictException('You already belong to a company');
    }

    const existing = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (existing) {
      throw new ConflictException('Company already exists for this user');
    }

    const company = await this.prisma.company.create({
      data: {
        ownerId,
        name: dto.name,
        bin: dto.bin,
        city: dto.city,
        description: dto.description,
        categories: dto.categories ?? [],
        members: {
          create: {
            userId: ownerId,
            title: 'Owner',
            role: CompanyMemberRole.OWNER,
          },
        },
      },
      include: {
        owner: { select: { avatarUrl: true } },
      },
    });
    await this.prisma.user.updateMany({
      where: { id: ownerId, role: { not: UserRole.ADMIN } },
      data: { role: UserRole.SUPPLIER },
    });
    return this.withAvatar(company);
  }

  async list(params: {
    city?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = {
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
      this.prisma.company.findMany({
        where,
        orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
        skip,
        take: limit,
        include: {
          owner: { select: { avatarUrl: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items: items.map((c) => this.withAvatar(c)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getById(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return this.withAvatar(company);
  }

  async listPublicProducts(
    companyId: string,
    params: { page?: number; limit?: number } = {},
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = { companyId, isActive: true };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          unit: true,
          city: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const enriched = await this.products.enrichPublicProducts(items);

    return {
      company,
      items: enriched,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async update(userId: string, companyId: string, dto: UpdateCompanyDto) {
    const resolved = await this.requireCompanyForUser(userId);
    if (resolved.company.id !== companyId) {
      throw new ForbiddenException('Not a company member');
    }
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Nothing to update');
    }
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: dto,
      include: {
        owner: { select: { avatarUrl: true } },
      },
    });
    return this.withAvatar(company);
  }

  async uploadLogo(userId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (!file.mimetype?.startsWith(IMAGE_MIME_PREFIX)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const resolved = await this.requireCompanyForUser(userId);
    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: `logos/${resolved.company.id}`,
    });

    const company = await this.prisma.company.update({
      where: { id: resolved.company.id },
      data: {
        logoUrl: uploaded.url,
        logoKey: uploaded.key,
      },
      include: {
        owner: { select: { avatarUrl: true } },
      },
    });

    if (resolved.company.logoKey && resolved.company.logoKey !== uploaded.key) {
      await this.storage
        .delete(resolved.company.logoKey)
        .catch(() => undefined);
    }
    return this.withAvatar(company);
  }

  async removeLogo(userId: string) {
    const resolved = await this.requireCompanyForUser(userId);
    const company = await this.prisma.company.update({
      where: { id: resolved.company.id },
      data: { logoUrl: null, logoKey: null },
      include: {
        owner: { select: { avatarUrl: true } },
      },
    });
    if (resolved.company.logoKey) {
      await this.storage
        .delete(resolved.company.logoKey)
        .catch(() => undefined);
    }
    return this.withAvatar(company);
  }

  async getMyCompany(userId: string) {
    const resolved = await this.ensureSupplierCompany(userId);
    if (!resolved) {
      throw new NotFoundException('Company not found');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: resolved.company.id },
      include: {
        owner: { select: { avatarUrl: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                avatarUrl: true,
                lastSeenAt: true,
                createdAt: true,
              },
            },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return {
      ...this.withAvatar(company),
      myRole: resolved.isOwner
        ? CompanyMemberRole.OWNER
        : (resolved.membership?.role ?? CompanyMemberRole.MANAGER),
      isOwner: resolved.isOwner || company.ownerId === userId,
    };
  }

  async listMembers(userId: string) {
    const resolved = await this.requireCompanyForUser(userId);
    return this.prisma.companyMember.findMany({
      where: { companyId: resolved.company.id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async removeMember(userId: string, memberUserId: string) {
    const resolved = await this.requireOwner(userId);
    if (memberUserId === userId || memberUserId === resolved.company.ownerId) {
      throw new BadRequestException('Cannot remove company owner');
    }
    const member = await this.prisma.companyMember.findFirst({
      where: { companyId: resolved.company.id, userId: memberUserId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === CompanyMemberRole.OWNER) {
      throw new BadRequestException('Cannot remove company owner');
    }
    await this.prisma.companyMember.delete({ where: { id: member.id } });
    return { ok: true };
  }

  async createInvite(userId: string, dto: CreateInviteDto) {
    const resolved = await this.requireOwner(userId);
    const email = dto.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Employee email is required');
    }
    if (dto.role && dto.role !== CompanyMemberRole.MANAGER) {
      throw new BadRequestException('Only manager role can be invited');
    }
    const hours = dto.expiresInHours ?? 72;
    if (hours < 1 || hours > 720) {
      throw new BadRequestException('expiresInHours must be between 1 and 720');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: resolved.company.ownerId },
      select: { email: true },
    });
    if (owner?.email.toLowerCase() === email) {
      throw new BadRequestException('Owner is already in the company');
    }

    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId: resolved.company.id,
        user: { email: { equals: email, mode: 'insensitive' } },
      },
    });
    if (existingMember) {
      throw new ConflictException('This person is already in the company');
    }

    const pending = await this.prisma.companyInvite.findFirst({
      where: {
        companyId: resolved.company.id,
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException(
        'An active invite already exists for this email',
      );
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const title = dto.title?.trim() || null;
    const invite = await this.prisma.companyInvite.create({
      data: {
        token,
        companyId: resolved.company.id,
        createdById: userId,
        email,
        role: CompanyMemberRole.MANAGER,
        title,
        expiresAt,
      },
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      await this.prisma.notification.create({
        data: {
          userId: existingUser.id,
          type: NotificationType.SYSTEM,
          title: resolved.company.name,
          body: email,
          payload: {
            inviteToken: token,
            path: `/invite/${token}`,
          },
        },
      });
    }

    return {
      id: invite.id,
      token: invite.token,
      email: invite.email,
      role: invite.role,
      title: invite.title,
      expiresAt: invite.expiresAt,
      urlPath: `/invite/${invite.token}`,
    };
  }

  async listInvites(userId: string) {
    const resolved = await this.requireOwner(userId);
    return this.prisma.companyInvite.findMany({
      where: {
        companyId: resolved.company.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        title: true,
        expiresAt: true,
        createdAt: true,
        token: true,
      },
    });
  }

  async revokeInvite(userId: string, inviteId: string) {
    const resolved = await this.requireOwner(userId);
    const invite = await this.prisma.companyInvite.findFirst({
      where: { id: inviteId, companyId: resolved.company.id, usedAt: null },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    await this.prisma.companyInvite.delete({ where: { id: invite.id } });
    return { ok: true };
  }

  async getInvitePublic(token: string) {
    const invite = await this.prisma.companyInvite.findUnique({
      where: { token },
      include: {
        company: { select: { id: true, name: true, city: true } },
      },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    const expired = invite.expiresAt.getTime() < Date.now();
    const used = Boolean(invite.usedAt);
    return {
      company: invite.company,
      email: invite.email || null,
      role: invite.role,
      title: invite.title,
      expiresAt: invite.expiresAt,
      valid: !expired && !used,
      expired,
      used,
    };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.prisma.companyInvite.findUnique({
      where: { token },
      include: { company: true },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.usedAt) {
      throw new BadRequestException('Invite already used');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invite expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (
      invite.email &&
      user.email.toLowerCase() !== invite.email.toLowerCase()
    ) {
      throw new ForbiddenException('Sign in with the invited email');
    }

    const existingMembership = await this.prisma.companyMember.findUnique({
      where: { userId },
    });
    if (existingMembership) {
      if (existingMembership.companyId === invite.companyId) {
        return { ok: true, companyId: invite.companyId, alreadyMember: true };
      }
      throw new ConflictException('You already belong to another company');
    }

    if (invite.company.ownerId === userId) {
      throw new BadRequestException('Owner is already in the company');
    }

    const role =
      invite.role === CompanyMemberRole.OWNER
        ? CompanyMemberRole.MANAGER
        : invite.role;

    await this.prisma.$transaction([
      this.prisma.companyMember.create({
        data: {
          companyId: invite.companyId,
          userId,
          role,
          title: invite.title,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { role: UserRole.SUPPLIER },
      }),
      this.prisma.companyInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedById: userId },
      }),
    ]);

    return { ok: true, companyId: invite.companyId, alreadyMember: false };
  }
}
