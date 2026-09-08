import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { Observable, Subject } from 'rxjs';

export type ChatMessageEvent = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
  };
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
  }>;
};

type PublishableMessage = Message & {
  sender: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
  };
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: Date;
  }>;
};

@Injectable()
export class ChatEventsService {
  private readonly logger = new Logger(ChatEventsService.name);
  private readonly subjects = new Map<string, Subject<ChatMessageEvent>>();
  private broadcaster: ((event: ChatMessageEvent) => void) | null = null;

  setBroadcaster(fn: (event: ChatMessageEvent) => void) {
    this.broadcaster = fn;
  }

  /**
   * Fan a stored message out to SSE subscribers and the WebSocket gateway.
   * Delivery is best effort: the message is already persisted, so a broken
   * transport must never turn a successful send into a 500 for the sender.
   */
  publish(message: PublishableMessage) {
    const event: ChatMessageEvent = {
      id: message.id,
      conversationId: message.conversationId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
      attachments: message.attachments?.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    // Only notify channels somebody is actually listening on, so `publish`
    // never allocates a Subject that nothing will ever unsubscribe from.
    try {
      this.subjects.get(message.conversationId)?.next(event);
    } catch (err) {
      this.logger.warn(`SSE fan-out failed: ${errorText(err)}`);
    }

    try {
      this.broadcaster?.(event);
    } catch (err) {
      this.logger.warn(`WebSocket fan-out failed: ${errorText(err)}`);
    }
  }

  /** Hot stream of messages for one conversation; the channel is dropped with its last subscriber. */
  stream(conversationId: string): Observable<ChatMessageEvent> {
    return new Observable<ChatMessageEvent>((subscriber) => {
      const subject = this.channel(conversationId);
      const sub = subject.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.release(conversationId);
      };
    });
  }

  /** Number of conversations with a live SSE subscriber. */
  get channelCount() {
    return this.subjects.size;
  }

  private channel(conversationId: string) {
    let subject = this.subjects.get(conversationId);
    if (!subject) {
      subject = new Subject<ChatMessageEvent>();
      this.subjects.set(conversationId, subject);
    }
    return subject;
  }

  private release(conversationId: string) {
    const subject = this.subjects.get(conversationId);
    if (subject && !subject.observed) {
      subject.complete();
      this.subjects.delete(conversationId);
    }
  }
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
