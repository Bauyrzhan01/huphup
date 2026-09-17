import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_SECTIONS,
  findSupplierTabSection,
  isSupplierSectionActive,
} from './supplierNav';

function activeLabels(pathname: string) {
  return SUPPLIER_SECTIONS.filter((s) => isSupplierSectionActive(s, pathname)).map((s) => s.label);
}

describe('supplier navigation', () => {
  it('держит меню коротким', () => {
    expect(SUPPLIER_SECTIONS).toHaveLength(7);
  });

  it.each([
    ['/supplier', 'nav.dashboard'],
    ['/supplier/leads', 'nav.requests'],
    ['/supplier/offers', 'nav.requests'],
    ['/supplier/deals', 'nav.crm'],
    ['/supplier/tasks', 'nav.crm'],
    ['/supplier/crm/settings', 'nav.crm'],
    ['/supplier/products', 'nav.products'],
    ['/supplier/products/new', 'nav.products'],
    ['/deals', 'nav.deals'],
    ['/balance', 'nav.deals'],
    ['/conversations', 'nav.chats'],
    ['/supplier/company', 'nav.company'],
    ['/supplier/team', 'nav.company'],
  ])('%s подсвечивает ровно один пункт — %s', (pathname, label) => {
    expect(activeLabels(pathname)).toEqual([label]);
  });

  it('вкладки показываются только на страницах-вкладках', () => {
    expect(findSupplierTabSection('/balance')?.label).toBe('nav.deals');
    expect(findSupplierTabSection('/supplier/team')?.label).toBe('nav.company');
    expect(findSupplierTabSection('/supplier/crm/settings')).toBeUndefined();
    expect(findSupplierTabSection('/supplier/products')).toBeUndefined();
  });
});
