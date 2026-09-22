export type RequestStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS';

export type RecentRequest = {
  id: string;
  code: string;
  title: string;
  city: string;
  status: RequestStatus;
  offers: number;
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликована',
  IN_PROGRESS: 'В работе',
};

export const CITIES = ['Алматы', 'Астана', 'Шымкент', 'Караганда', 'Актобе'];

export const DEADLINES = ['Сегодня', '3 дня', 'Неделя', 'Месяц'];

export const EXAMPLES = [
  'Цемент М400, 20 тонн с доставкой',
  'Офисные кресла, 30 штук',
  'Спецодежда для бригады, 15 комплектов',
];

export const RECENT_REQUESTS: RecentRequest[] = [
  {
    id: '1',
    code: 'HH-1042',
    title: 'Цемент М400, 20 тонн',
    city: 'Алматы',
    status: 'IN_PROGRESS',
    offers: 3,
  },
  {
    id: '2',
    code: 'HH-1038',
    title: 'Офисные столы 140 см, 12 шт',
    city: 'Астана',
    status: 'PUBLISHED',
    offers: 1,
  },
  {
    id: '3',
    code: 'HH-1031',
    title: 'Нитриловые перчатки, 50 коробок',
    city: 'Алматы',
    status: 'PUBLISHED',
    offers: 0,
  },
];
