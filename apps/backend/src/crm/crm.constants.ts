import { LeadStatus } from '@prisma/client';

export const DEFAULT_CRM_STAGES: Array<{
  status: LeadStatus;
  label: string;
  sortOrder: number;
  color: string;
}> = [
  { status: LeadStatus.NEW, label: 'Входящие', sortOrder: 0, color: '#3b82f6' },
  {
    status: LeadStatus.VIEWED,
    label: 'В работе',
    sortOrder: 1,
    color: '#8b5cf6',
  },
  {
    status: LeadStatus.OFFERED,
    label: 'КП отправлено',
    sortOrder: 2,
    color: '#f59e0b',
  },
  {
    status: LeadStatus.SKIPPED,
    label: 'Пропущено',
    sortOrder: 3,
    color: '#9ca3af',
  },
];

export const DEFAULT_AUTOMATION_RULES = [
  {
    trigger: 'NEW_UNASSIGNED',
    action: 'NOTIFY_OWNER',
    config: { hours: 2 },
  },
  {
    trigger: 'IDLE_IN_STATUS',
    action: 'NOTIFY_ASSIGNEE',
    config: { hours: 24, statuses: ['VIEWED'] },
  },
] as const;

export const IDLE_NEW_HOURS = 2;
export const IDLE_STAGE_HOURS = 24;
