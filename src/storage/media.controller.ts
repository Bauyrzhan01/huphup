import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    const safeName = file.fileName.replace(/"/g, '');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(file.data);
  }
}
