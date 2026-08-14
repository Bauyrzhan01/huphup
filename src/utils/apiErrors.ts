import { ApiError } from '../api/client';

const SUPPLIER_MEMBERSHIP = 'Supplier company membership required';
const COMPANY_NOT_FOUND = 'Company not found';

export function mapApiError(
  err: unknown,
  t: (key: string) => string,
): string {
  if (err instanceof ApiError) {
    if (err.message === SUPPLIER_MEMBERSHIP || err.message === COMPANY_NOT_FOUND) {
      return t('products.noCompany');
    }
    if (err.message === 'network') return t('requests.networkError');
    if (err.message === 'timeout') return t('requests.timeoutError');
    return err.message;
  }
  if (err instanceof Error && /failed to fetch/i.test(err.message)) {
    return t('requests.networkError');
  }
  return err instanceof Error ? err.message : t('common.error');
}

export function isNoCompanyError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 404 ||
    err.message === SUPPLIER_MEMBERSHIP ||
    err.message === COMPANY_NOT_FOUND
  );
}
