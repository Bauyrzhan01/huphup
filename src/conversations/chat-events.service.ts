import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { Subject } from 'rxjs';

export type ChatMessageEvent = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string; avatarUrl?: string | null };
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
  }>;
};

@Injectable()
export class ChatEventsService {
  private readonly subjects = new Map<string, Subject<ChatMessageEvent>>();
  private broadcaster: ((event: ChatMessageEvent) => void) | null = null;

  setBroadcaster(fn: (event: ChatMessageEvent) => void) {
    this.broadcaster = fn;
  }

  private channel(conversationId: string) {
    let subject = this.subjects.get(conversationId);
    if (!subject) {
      subject = new Subject<ChatMessageEvent>();
      this.subjects.set(conversationId, subject);
    }
    return subject;
  }

  publish(
    message: Message & {
      sender: { id: string; fullName: string; role: string; avatarUrl?: string | null };
      attachments?: Array<{
        id: string;
        fileName: string;
        fileUrl: string;
        mimeType: string | null;
        sizeBytes: number | null;
        createdAt: Date;
      }>;
    },
  ) {
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
    this.channel(message.conversationId).next(event);
    this.broadcaster?.(event);
  }

  stream(conversationId: string) {
    return this.channel(conversationId).asObservable();
  }
}
