import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtService } from '@nestjs/jwt';
import { Observable, map } from 'rxjs';
import { ConversationsService } from './conversations.service';
import { PinConversationDto, SendMessageDto } from './dto/message.dto';
import { MessagesQueryDto } from '../common/dto/pagination.dto';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversationsService.listMine(user.id);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.hideForMe(user.id, id);
  }

  @Post(':id/pin')
  @HttpCode(200)
  pin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PinConversationDto,
  ) {
    return this.conversationsService.setPinned(user.id, id, dto?.isPinned);
  }

  @Public()
  @Sse(':id/stream')
  @ApiQuery({ name: 'access_token', required: true })
  stream(
    @Param('id') id: string,
    @Query('access_token') accessToken: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let innerSub: { unsubscribe: () => void } | undefined;
      void (async () => {
        try {
          const payload = await this.jwt.verifyAsync<{ sub: string }>(
            accessToken,
          );
          await this.conversationsService.requireMember(payload.sub, id);
          innerSub = this.conversationsService
            .streamMessages(id)
            .pipe(map((msg) => ({ data: msg })))
            .subscribe({
              next: (event) => subscriber.next(event),
              error: (err) => subscriber.error(err),
            });
        } catch (err) {
          subscriber.error(err);
        }
      })();
      return () => innerSub?.unsubscribe();
    });
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.conversationsService.getMessages(user.id, id, query);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(user.id, id, dto.body);
  }

  @Post(':id/messages/file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        body: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  sendWithFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('body') body?: string,
  ) {
    return this.conversationsService.sendMessageWithFile(user.id, id, file, body);
  }
}
