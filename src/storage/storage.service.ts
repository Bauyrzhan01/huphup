import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBaseUrl: string | null;
  private readonly localDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const region = this.config.get<string>('AWS_REGION');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? null;
    this.publicBaseUrl = this.config.get<string>('AWS_S3_PUBLIC_URL') ?? null;

    if (region && accessKeyId && secretAccessKey && this.bucket) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        ...(this.config.get<string>('AWS_S3_ENDPOINT')
          ? {
              endpoint: this.config.get<string>('AWS_S3_ENDPOINT'),
              forcePathStyle: true,
            }
          : {}),
      });
    } else {
      this.s3 = null;
      this.logger.warn(
        'File storage is local/DB (Railway disk is wiped on deploy). Add S3 or files persist in Postgres.',
      );
    }

    this.localDir =
      this.config.get<string>('UPLOADS_DIR')?.trim() ||
      join(process.cwd(), 'uploads');
  }

  get mode(): 's3' | 'local' {
    return this.s3 ? 's3' : 'local';
  }

  async upload(input: {
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
    folder?: string;
  }): Promise<{ key: string; url: string }> {
    const safeName = input.fileName.replace(/[^\w.-]/g, '_').slice(0, 120);
    const mimeType = input.mimeType || 'application/octet-stream';
    const key = `${input.folder ?? 'files'}/${randomUUID()}-${safeName}`;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: mimeType,
          ContentDisposition: 'inline',
        }),
      );
      const url = this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/$/, '')}/${encodedKey}`
        : `https://${this.bucket}.s3.amazonaws.com/${encodedKey}`;
      return { key, url };
    }

    const stored = await this.prisma.storedFile.create({
      data: {
        fileName: safeName || 'file',
        mimeType,
        data: Buffer.from(input.buffer),
      },
    });

    await mkdir(this.localDir, { recursive: true }).catch(() => undefined);
    const diskName = key.replace(/\//g, '_');
    await writeFile(join(this.localDir, diskName), input.buffer).catch(
      () => undefined,
    );

    return { key: `db:${stored.id}`, url: `/api/v1/media/${stored.id}` };
  }

  async delete(key: string) {
    if (key.startsWith('db:')) {
      await this.prisma.storedFile
        .delete({ where: { id: key.slice(3) } })
        .catch(() => undefined);
      return;
    }
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return;
    }
    const fullPath = join(this.localDir, key.replace(/\//g, '_'));
    await unlink(fullPath).catch(() => undefined);
  }
}
