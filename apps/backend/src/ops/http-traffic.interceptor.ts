import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { trafficStore } from './traffic.store';

@Injectable()
export class HttpTrafficInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string } }>();
    const res = http.getResponse<Response>();
    const started = Date.now();
    const method = req.method;
    const path = String(req.originalUrl || req.url || '')
      .split('?')[0]
      .slice(0, 160);
    const userId = req.user?.id ? req.user.id.slice(-6) : undefined;

    const record = (status: number) => {
      trafficStore.push({
        method,
        path,
        status,
        ms: Date.now() - started,
        userId,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode || 200),
        error: (err: { status?: number }) =>
          record(typeof err?.status === 'number' ? err.status : 500),
      }),
    );
  }
}
