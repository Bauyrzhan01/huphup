import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { queryLogStore } from './query-log.store';
import { trafficStore } from './traffic.store';

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async snapshot() {
    queryLogStore.pause();
    try {
      const [
        health,
        tables,
        users,
        companies,
        requests,
        products,
        offers,
        leads,
        activities,
        messages,
        frontend,
      ] = await Promise.all([
        this.health(),
        this.tableCounts(),
        this.prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            role: true,
            isActive: true,
            lastSeenAt: true,
            createdAt: true,
          },
        }),
        this.prisma.company.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { name: true, city: true, verified: true, createdAt: true },
        }),
        this.prisma.request.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            code: true,
            title: true,
            city: true,
            status: true,
            createdAt: true,
          },
        }),
        this.prisma.product.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            name: true,
            city: true,
            isActive: true,
            createdAt: true,
          },
        }),
        this.prisma.offer.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            status: true,
            price: true,
            currency: true,
            createdAt: true,
            request: { select: { code: true } },
          },
        }),
        this.prisma.lead.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            status: true,
            createdAt: true,
            request: { select: { code: true, title: true } },
          },
        }),
        this.prisma.leadActivity.findMany({
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: {
            type: true,
            message: true,
            createdAt: true,
            lead: { select: { request: { select: { code: true } } } },
          },
        }),
        this.prisma.message.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { createdAt: true },
        }),
        this.probeFrontend(),
      ]);

      return {
        checkedAt: new Date().toISOString(),
        health,
        traffic: trafficStore.snapshot(),
        queries: queryLogStore.snapshot(),
        tables,
        recent: {
          users: users.map((row) => ({
            role: row.role,
            isActive: row.isActive,
            lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          })),
          companies: companies.map((row) => ({
            name: row.name,
            city: row.city,
            verified: row.verified,
            createdAt: row.createdAt.toISOString(),
          })),
          requests: requests.map((row) => ({
            code: row.code,
            title: row.title,
            city: row.city,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
          })),
          products: products.map((row) => ({
            name: row.name,
            city: row.city,
            isActive: row.isActive,
            createdAt: row.createdAt.toISOString(),
          })),
          offers: offers.map((row) => ({
            status: row.status,
            price: Number(row.price),
            currency: row.currency,
            requestCode: row.request.code,
            createdAt: row.createdAt.toISOString(),
          })),
          leads: leads.map((row) => ({
            status: row.status,
            requestCode: row.request.code,
            requestTitle: row.request.title,
            createdAt: row.createdAt.toISOString(),
          })),
          activities: activities.map((row) => ({
            type: row.type,
            message: row.message,
            requestCode: row.lead.request.code,
            createdAt: row.createdAt.toISOString(),
          })),
          messages: messages.map((row) => ({
            createdAt: row.createdAt.toISOString(),
          })),
        },
        frontend,
      };
    } finally {
      queryLogStore.resume();
    }
  }

  private async health() {
    let database: 'up' | 'down' = 'down';
    let dbLatencyMs: number | null = null;
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
      dbLatencyMs = Date.now() - started;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'huphup-backend',
      database,
      dbLatencyMs,
      time: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
    };
  }

  private async tableCounts() {
    const [
      users,
      companies,
      products,
      requests,
      offers,
      leads,
      leadActivities,
      leadTasks,
      conversations,
      messages,
      notifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.company.count(),
      this.prisma.product.count(),
      this.prisma.request.count(),
      this.prisma.offer.count(),
      this.prisma.lead.count(),
      this.prisma.leadActivity.count(),
      this.prisma.leadTask.count(),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.notification.count(),
    ]);
    return {
      users,
      companies,
      products,
      requests,
      offers,
      leads,
      leadActivities,
      leadTasks,
      conversations,
      messages,
      notifications,
    };
  }

  private async probeFrontend() {
    const base = (
      this.config.get<string>('FRONTEND_URL') ??
      'https://huphup-frontend.vercel.app'
    ).replace(/\/$/, '');
    const paths = ['/', '/login', '/suppliers'];
    const checks = await Promise.all(
      paths.map(async (path) => {
        const started = Date.now();
        try {
          const res = await fetch(`${base}${path}`, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
            headers: { Accept: 'text/html' },
          });
          const text = await res.text();
          return {
            path,
            ok: res.ok,
            status: res.status,
            ms: Date.now() - started,
            bytes: text.length,
            title: titleOf(text),
          };
        } catch (err) {
          return {
            path,
            ok: false,
            status: 0,
            ms: Date.now() - started,
            bytes: 0,
            title: null,
            error: err instanceof Error ? err.message : 'fetch failed',
          };
        }
      }),
    );
    return { base, checks };
  }
}

function titleOf(html: string) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match?.[1]?.trim().slice(0, 80) ?? null;
}
