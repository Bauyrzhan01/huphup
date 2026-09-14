import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../api/client';

const companiesMe = vi.fn();
const productsCreate = vi.fn();
const productsGet = vi.fn();
const productsReviews = vi.fn();

vi.mock('../../api', () => ({
  companiesApi: { me: () => companiesMe() },
  productsApi: {
    create: (body: unknown) => productsCreate(body),
    get: (id: string) => productsGet(id),
    reviews: (id: string) => productsReviews(id),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../../layouts/AppLayouts', () => ({
  SupplierLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ProductImagesEditor', () => ({
  ProductImagesEditor: () => <div data-testid="images-editor" />,
}));

vi.mock('../../hooks/useDirectoryMeta', () => ({
  useDirectoryMeta: () => ({ cities: ['Алматы'], categories: [], units: ['шт'] }),
}));

vi.mock('../../i18n/useAppLocale', () => ({
  useAppLocale: () => ({ formatDateTime: () => '14.09.2026, 10:00' }),
}));

// One `t` for the whole run: the page lists `t` in its load effect's deps, so a
// fresh function per render would restart loading forever (react-i18next's is stable).
vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

import { SupplierProductDetailPage } from './SupplierProductDetailPage';

const company = { id: 'c1', name: 'ТОО Тест', city: 'Алматы', categories: [], verified: false, rating: 0 };
const product = {
  id: 'p1',
  companyId: 'c1',
  name: 'Цемент М500',
  description: null,
  unit: null,
  city: 'Алматы',
  currency: 'KZT',
  isActive: true,
  createdAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-14T10:00:00.000Z',
  images: [],
};

// Same route table as App.tsx: `/new` is its own route and has no :id param.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/supplier/products/new" element={<SupplierProductDetailPage />} />
        <Route path="/supplier/products/:id" element={<SupplierProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupplierProductDetailPage', () => {
  beforeEach(() => {
    companiesMe.mockResolvedValue(company);
    productsCreate.mockResolvedValue(product);
    productsGet.mockResolvedValue(product);
    productsReviews.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the add form on /supplier/products/new instead of loading forever', async () => {
    renderAt('/supplier/products/new');

    const add = await screen.findByRole('button', { name: 'products.addBtn' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText('common.loading')).toBeNull();
    expect(companiesMe).toHaveBeenCalled();
    expect(productsGet).not.toHaveBeenCalled();
  });

  it('creates the product from the form and opens it', async () => {
    renderAt('/supplier/products/new');

    const add = await screen.findByRole('button', { name: 'products.addBtn' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByPlaceholderText('products.namePlaceholder'), {
      target: { value: 'Цемент М500' },
    });
    fireEvent.click(add);

    await waitFor(() =>
      expect(productsCreate).toHaveBeenCalledWith({
        name: 'Цемент М500',
        description: undefined,
        unit: undefined,
        city: 'Алматы',
      }),
    );
    await waitFor(() => expect(productsGet).toHaveBeenCalledWith('p1'));
    expect(await screen.findByRole('heading', { name: 'Цемент М500' })).toBeTruthy();
  });

  it('keeps «Добавить» usable when loading the company times out', async () => {
    companiesMe.mockRejectedValue(new ApiError(0, 'timeout'));
    renderAt('/supplier/products/new');

    expect(await screen.findByText('requests.timeoutError')).toBeTruthy();
    const add = screen.getByRole('button', { name: 'products.addBtn' });
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });

  it('blocks «Добавить» only when the user really has no company', async () => {
    companiesMe.mockRejectedValue(new ApiError(404, 'Company not found'));
    renderAt('/supplier/products/new');

    expect(await screen.findByText('products.noCompany')).toBeTruthy();
    const add = screen.getByRole('button', { name: 'products.addBtn' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('still loads an existing product by id', async () => {
    renderAt('/supplier/products/p1');

    expect(await screen.findByRole('heading', { name: 'Цемент М500' })).toBeTruthy();
    expect(productsGet).toHaveBeenCalledWith('p1');
    expect(companiesMe).not.toHaveBeenCalled();
  });
});
