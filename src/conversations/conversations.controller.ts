import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Observable, map } from 'rxjs';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/message.dto';
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
}
