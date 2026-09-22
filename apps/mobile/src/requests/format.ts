import type { RequestStatus } from '../api/requests';
import { colors } from '../theme';

export const STATUS: Record<RequestStatus, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: 'Черновик', bg: colors.soft, fg: colors.muted },
  PUBLISHED: { label: 'Открыта', bg: colors.amberSoft, fg: colors.amber },
  IN_PROGRESS: { label: 'В работе', bg: colors.greenSoft, fg: colors.green },
  CLOSED: { label: 'Закрыта', bg: colors.soft, fg: colors.muted },
  CANCELLED: { label: 'Отменена', bg: colors.soft, fg: colors.muted },
};

export function offersLabel(count: number) {
  if (!count) return 'ждём предложения';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'предложение'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'предложения'
        : 'предложений';
  return `${count} ${word}`;
}

export function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function formatMoney(value: string | number, currency = 'KZT') {
  const n = Number(value);
  const text = Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(value);
  return currency === 'KZT' ? `${text} ₸` : `${text} ${currency}`;
}

/** Deadline shortcuts → the ISO date the API stores. */
export const DEADLINE_CHOICES = [
  { label: 'Сегодня', days: 0 },
  { label: 'За 3 дня', days: 3 },
  { label: 'За неделю', days: 7 },
  { label: 'За месяц', days: 30 },
];

export function isoInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
