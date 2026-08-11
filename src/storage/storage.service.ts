import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBaseUrl: string | null;
  private readonly localDir: string;

  constructor(private readonly config: ConfigService) {
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
          ? { endpoint: this.config.get<string>('AWS_S3_ENDPOINT'), forcePathStyle: true }
          : {}),
      });
    } else {
      this.s3 = null;
    }

    this.localDir = join(process.cwd(), 'uploads');
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
    const safeName = input.fileName.replace(/[^\w.\-()+\s]/g, '_').slice(0, 120);
    const key = `${input.folder ?? 'files'}/${randomUUID()}-${safeName}`;

    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimeType,
        }),
      );
      const url = this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
        : `https://${this.bucket}.s3.amazonaws.com/${key}`;
      return { key, url };
    }

    await mkdir(this.localDir, { recursive: true });
    const fullPath = join(this.localDir, key.replace(/\//g, '_'));
    await writeFile(fullPath, input.buffer);
    return { key, url: `/uploads/${key.replace(/\//g, '_')}` };
  }

  async delete(key: string) {
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
