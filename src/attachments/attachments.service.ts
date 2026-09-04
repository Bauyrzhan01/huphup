import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listForRequest(userId: string, requestId: string) {
    await this.requireOwner(userId, requestId);
    return this.prisma.attachment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    userId: string,
    requestId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    const request = await this.requireOwner(userId, requestId);
    if (request.status !== 'DRAFT' && request.status !== 'CANCELLED') {
      throw new ForbiddenException(
        'Attachments only on draft/cancelled requests',
      );
    }

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: `requests/${requestId}`,
    });

    return this.prisma.attachment.create({
      data: {
        requestId,
        fileName: file.originalname,
        fileUrl: uploaded.url,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async remove(userId: string, requestId: string, attachmentId: string) {
    const request = await this.requireOwner(userId, requestId);
    if (request.status !== 'DRAFT' && request.status !== 'CANCELLED') {
      throw new ForbiddenException(
        'Attachments only on draft/cancelled requests',
      );
    }
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, requestId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }

  private async requireOwner(userId: string, requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.buyerId !== userId) {
      throw new ForbiddenException('Not request owner');
    }
    return request;
  }
}
