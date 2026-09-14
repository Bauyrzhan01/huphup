import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { Deal, DealStatus } from '../types';

const list = vi.fn();
const pay = vi.fn();
const ship = vi.fn();
const confirm = vi.fn();

let mode: 'buyer' | 'supplier' = 'buyer';

vi.mock('../api', () => ({
  dealsApi: {
    list: () => list(),
    pay: (id: string) => pay(id),
    ship: (id: string) => ship(id),
    confirm: (id: string) => confirm(id),
    cancel: vi.fn(),
    dispute: vi.fn(),
  },
}));

vi.mock('../hooks/useWorkspaceMode', () => ({
  useWorkspaceMode: () => ({ mode, isSupplier: mode === 'supplier' }),
}));

vi.mock('../layouts/AppLayouts', () => ({
  BuyerLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SupplierLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../i18n/useAppLocale', () => ({
  useAppLocale: () => ({
    formatMoney: (value: string | number) => `${value}`,
    formatDateTime: () => '11.09.2026',
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { DealsPage } from './DealsPage';

function deal(
  status: DealStatus,
  side: 'buyer' | 'supplier',
  over: { id?: string; code?: string } = {},
): Deal {
  return {
    id: over.id ?? 'deal-1',
    status,
    side,
    amount: '450000.00',
    commission: '0.00',
    payout: '450000.00',
    currency: 'KZT',
    offerId: 'offer-1',
    deliveryDays: 3,
    disputeReason: null,
    request: { id: 'r1', code: over.code ?? 'HH-1001', title: 'Цемент М400', city: 'Алматы' },
    company: { id: 'c1', name: 'Алматы Цемент Опт', city: 'Алматы' },
    buyer: { id: 'u1', fullName: 'Айгуль', email: 'buyer@huphup.test' },
    fundedAt: null,
    shippedAt: null,
    autoReleaseAt: null,
    releasedAt: null,
    refundedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

describe('DealsPage', () => {
  beforeEach(() => {
    mode = 'buyer';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('покупателю предлагает оплатить неоплаченную сделку', async () => {
    list.mockResolvedValue([deal('AWAITING_PAYMENT', 'buyer')]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('deals.pay')).toBeDefined());
    expect(screen.queryByText('deals.ship')).toBeNull();
    expect(screen.queryByText('deals.confirm')).toBeNull();
  });

  it('поставщику предлагает отгрузку, когда деньги на удержании', async () => {
    mode = 'supplier';
    list.mockResolvedValue([deal('HELD', 'supplier')]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('deals.ship')).toBeDefined());
    expect(screen.queryByText('deals.pay')).toBeNull();
  });

  it('в режиме заказчика показывает свои покупки, даже если у аккаунта есть компания', async () => {
    list.mockResolvedValue([
      deal('AWAITING_PAYMENT', 'buyer', { id: 'bought', code: 'HH-1001' }),
      deal('HELD', 'supplier', { id: 'sold', code: 'HH-2002' }),
    ]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('HH-1001')).toBeDefined());
    expect(screen.getByText('deals.pay')).toBeDefined();
    expect(screen.queryByText('HH-2002')).toBeNull();
    expect(screen.queryByText('deals.ship')).toBeNull();
  });

  it('в режиме поставщика показывает только сделки компании', async () => {
    mode = 'supplier';
    list.mockResolvedValue([
      deal('AWAITING_PAYMENT', 'buyer', { id: 'bought', code: 'HH-1001' }),
      deal('HELD', 'supplier', { id: 'sold', code: 'HH-2002' }),
    ]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('HH-2002')).toBeDefined());
    expect(screen.getByText('deals.ship')).toBeDefined();
    expect(screen.queryByText('HH-1001')).toBeNull();
    expect(screen.queryByText('deals.pay')).toBeNull();
  });

  it('покупателю после отгрузки предлагает подтвердить получение', async () => {
    list.mockResolvedValue([deal('SHIPPED', 'buyer')]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('deals.confirm')).toBeDefined());
    expect(screen.getByText('deals.dispute')).toBeDefined();
  });

  it('по закрытой сделке никаких действий не предлагает', async () => {
    list.mockResolvedValue([deal('RELEASED', 'buyer')]);

    render(<DealsPage />);

    await waitFor(() =>
      expect(screen.getByText('deals.status.RELEASED')).toBeDefined(),
    );
    expect(screen.queryByText('deals.pay')).toBeNull();
    expect(screen.queryByText('deals.confirm')).toBeNull();
    expect(screen.queryByText('deals.dispute')).toBeNull();
  });

  it('поставщик не видит кнопку оплаты по неоплаченной сделке', async () => {
    mode = 'supplier';
    list.mockResolvedValue([deal('AWAITING_PAYMENT', 'supplier')]);

    render(<DealsPage />);

    await waitFor(() =>
      expect(screen.getByText('deals.status.AWAITING_PAYMENT')).toBeDefined(),
    );
    expect(screen.queryByText('deals.pay')).toBeNull();
  });

  it('показывает сумму, код заявки и контрагента', async () => {
    list.mockResolvedValue([deal('HELD', 'buyer')]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('HH-1001')).toBeDefined());
    expect(screen.getByText('Цемент М400')).toBeDefined();
    expect(screen.getByText(/Алматы Цемент Опт/)).toBeDefined();
    expect(screen.getByText('450000.00 KZT')).toBeDefined();
  });

  it('ошибку сервера не выдаёт за пустой список сделок', async () => {
    list.mockRejectedValue(new ApiError(500, 'Internal server error'));

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('apiErrors.server')).toBeDefined());
    expect(screen.queryByText('deals.empty')).toBeNull();
  });

  it('пустой список объясняет, откуда берутся сделки', async () => {
    list.mockResolvedValue([]);

    render(<DealsPage />);

    await waitFor(() => expect(screen.getByText('deals.empty')).toBeDefined());
  });

  it('показывает ошибку, если сделки не загрузились', async () => {
    list.mockRejectedValue(new Error('Сервис недоступен'));

    render(<DealsPage />);

    await waitFor(() =>
      expect(screen.getByText('Сервис недоступен')).toBeDefined(),
    );
  });
});
