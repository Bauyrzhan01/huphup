import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('requests')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':requestId/attachments')
  list(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.attachments.listForRequest(user.id, requestId);
  }

  @Post(':requestId/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.upload(user.id, requestId, file);
  }

  @Delete(':requestId/attachments/:attachmentId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachments.remove(user.id, requestId, attachmentId);
  }
}
