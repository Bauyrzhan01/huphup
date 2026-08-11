import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { Subject } from 'rxjs';

export type ChatMessageEvent = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string };
};

@Injectable()
export class ChatEventsService {
  private readonly subjects = new Map<string, Subject<ChatMessageEvent>>();

  private channel(conversationId: string) {
    let subject = this.subjects.get(conversationId);
    if (!subject) {
      subject = new Subject<ChatMessageEvent>();
      this.subjects.set(conversationId, subject);
    }
    return subject;
  }

  publish(message: Message & { sender: { id: string; fullName: string; role: string } }) {
    const event: ChatMessageEvent = {
      id: message.id,
      conversationId: message.conversationId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
    };
    this.channel(message.conversationId).next(event);
  }

  stream(conversationId: string) {
    return this.channel(conversationId).asObservable();
  }
}
