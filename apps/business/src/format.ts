import type { RequestStatus } from './api/leads';
import { colors } from './theme';

export const STATUS: Record<RequestStatus, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: 'Черновик', bg: colors.soft, fg: colors.muted },
  PUBLISHED: { label: 'Открыта', bg: colors.amberSoft, fg: colors.amber },
  IN_PROGRESS: { label: 'В работе', bg: colors.greenSoft, fg: colors.green },
  CLOSED: { label: 'Закрыта', bg: colors.soft, fg: colors.muted },
  CANCELLED: { label: 'Отменена', bg: colors.soft, fg: colors.muted },
};

export function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function formatMoney(value: string | number, currency = 'KZT') {
  const n = Number(value);
  const text = Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(value);
  return currency === 'KZT' ? `${text} ₸` : `${text} ${currency}`;
}
