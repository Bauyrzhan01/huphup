import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const me = vi.fn();
const myTransactions = vi.fn();
const adminList = vi.fn();

let role = 'BUYER';

vi.mock('../api', () => ({
  walletsApi: {
    me: () => me(),
    myTransactions: () => myTransactions(),
    adminList: () => adminList(),
    adminCredit: vi.fn(),
    adminDebit: vi.fn(),
  },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role } }),
}));

vi.mock('../layouts/AppLayouts', () => ({
  BuyerLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SupplierLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../i18n/useAppLocale', () => ({
  useAppLocale: () => ({
    formatMoney: (value: string | number) => `${value} ₸`,
    formatDateTime: () => '01.09.2026, 10:00',
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

import { BalancePage } from './BalancePage';

const history = {
  items: [
    {
      id: 't1',
      type: 'CREDIT' as const,
      amount: '50000.00',
      balanceAfter: '50000.00',
      comment: 'Перевод №142',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 't2',
      type: 'DEBIT' as const,
      amount: '2000.00',
      balanceAfter: '48000.00',
      comment: null,
      createdAt: '2026-09-02T10:00:00.000Z',
    },
  ],
  page: 1,
  limit: 20,
  total: 2,
  totalPages: 1,
};

describe('BalancePage', () => {
  beforeEach(() => {
    role = 'BUYER';
    me.mockResolvedValue({ balance: '48000.00', currency: 'KZT' });
    myTransactions.mockResolvedValue(history);
    adminList.mockResolvedValue({
      items: [],
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('показывает остаток и валюту', async () => {
    render(<BalancePage />);

    await waitFor(() => expect(screen.getByText('48000.00 ₸')).toBeDefined());
    expect(screen.getByText('KZT')).toBeDefined();
  });

  it('разделяет приход и расход знаком и суммой', async () => {
    render(<BalancePage />);

    await waitFor(() => expect(screen.getByText('+50000.00 ₸')).toBeDefined());
    expect(screen.getByText('−2000.00 ₸')).toBeDefined();
  });

  it('знаковая сумма расхода (из сейф-сделок) не даёт двойной минус', async () => {
    myTransactions.mockResolvedValue({
      ...history,
      items: [
        {
          id: 'hold',
          type: 'DEBIT' as const,
          amount: '-1575000.00', // billing.move хранит расход со знаком
          balanceAfter: '48000.00',
          comment: 'Оплата сделки',
          createdAt: '2026-09-03T10:00:00.000Z',
        },
      ],
    });

    render(<BalancePage />);

    await waitFor(() => expect(screen.getByText('−1575000.00 ₸')).toBeDefined());
    expect(screen.queryByText('−−1575000.00 ₸')).toBeNull();
  });

  it('поставщику показывает, что это кошелёк компании', async () => {
    role = 'SUPPLIER';
    me.mockResolvedValue({
      balance: '1200000.00',
      currency: 'KZT',
      scope: 'company',
      companyName: 'КровляПро KZ',
    });

    render(<BalancePage />);

    await waitFor(() =>
      expect(screen.getByText(/balance.companyWallet/)).toBeDefined(),
    );
  });

  it('показывает комментарий операции, когда он есть', async () => {
    render(<BalancePage />);

    await waitFor(() =>
      expect(screen.getByText(/Перевод №142/)).toBeDefined(),
    );
  });

  it('пишет, что операций нет, когда история пуста', async () => {
    myTransactions.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });

    render(<BalancePage />);

    await waitFor(() =>
      expect(screen.getByText('balance.historyEmpty')).toBeDefined(),
    );
  });

  it('обычному пользователю не показывает управление балансами', async () => {
    render(<BalancePage />);

    await waitFor(() => expect(screen.getByText('48000.00 ₸')).toBeDefined());
    expect(screen.queryByText('balance.adminTitle')).toBeNull();
    expect(adminList).not.toHaveBeenCalled();
  });

  it('администратору показывает управление балансами', async () => {
    role = 'ADMIN';

    render(<BalancePage />);

    await waitFor(() =>
      expect(screen.getByText('balance.adminTitle')).toBeDefined(),
    );
    expect(adminList).toHaveBeenCalled();
  });

  it('сообщает об ошибке, когда баланс не загрузился', async () => {
    me.mockRejectedValue(new Error('Сервис недоступен'));

    render(<BalancePage />);

    await waitFor(() =>
      expect(screen.getByText('Сервис недоступен')).toBeDefined(),
    );
  });
});
