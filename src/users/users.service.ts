import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StorageService } from '../storage/storage.service';

const IMAGE_MIME_PREFIX = 'image/';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private readonly userSelect = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    avatarUrl: true,
    role: true,
    createdAt: true,
    company: {
      select: {
        id: true,
        name: true,
        city: true,
        verified: true,
        categories: true,
        rating: true,
        logoUrl: true,
      },
    },
  } as const;

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
      select: this.userSelect,
    });
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (!file.mimetype?.startsWith(IMAGE_MIME_PREFIX)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarKey: true },
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: `avatars/${userId}`,
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploaded.url,
        avatarKey: uploaded.key,
      },
      select: this.userSelect,
    });

    if (current.avatarKey && current.avatarKey !== uploaded.key) {
      await this.storage.delete(current.avatarKey).catch(() => undefined);
    }
    return user;
  }

  async removeAvatar(userId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarKey: true },
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null, avatarKey: null },
    });
    if (current.avatarKey) {
      await this.storage.delete(current.avatarKey).catch(() => undefined);
    }
    return { ok: true };
  }
}
