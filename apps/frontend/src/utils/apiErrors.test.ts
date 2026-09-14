import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { isNoCompanyError, mapApiError } from './apiErrors';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

describe('mapApiError', () => {
  it('translates known English server messages', () => {
    expect(mapApiError(new ApiError(404, 'Request not found'), t)).toBe('apiErrors.requestNotFound');
    expect(mapApiError(new ApiError(401, 'Invalid credentials'), t)).toBe('apiErrors.invalidCredentials');
    expect(mapApiError(new ApiError(409, 'Email already registered'), t)).toBe('apiErrors.emailTaken');
    expect(mapApiError(new ApiError(400, 'Insufficient balance'), t)).toBe('apiErrors.insufficientBalance');
  });

  it('keeps the no-company mapping', () => {
    expect(mapApiError(new ApiError(403, 'Supplier company membership required'), t)).toBe('products.noCompany');
    expect(mapApiError(new ApiError(404, 'Company not found'), t)).toBe('products.noCompany');
  });

  it('finds a known message inside joined validation errors', () => {
    const err = new ApiError(400, 'email must be an email, password must be longer than or equal to 8 characters');
    expect(mapApiError(err, t)).toBe('apiErrors.invalidEmail');
    expect(mapApiError(new ApiError(400, 'password must be longer than or equal to 8 characters'), t)).toBe(
      'apiErrors.passwordTooShort:{"min":8}',
    );
  });

  it('falls back to a message for the HTTP status when the text is unknown English', () => {
    expect(mapApiError(new ApiError(400, 'title should not be empty'), t)).toBe('apiErrors.badRequest');
    expect(mapApiError(new ApiError(401, 'Unauthorized'), t)).toBe('apiErrors.unauthorized');
    expect(mapApiError(new ApiError(403, 'Something forbidden'), t)).toBe('apiErrors.accessDenied');
    expect(mapApiError(new ApiError(404, 'Thing not found'), t)).toBe('apiErrors.notFound');
    expect(mapApiError(new ApiError(429, 'ThrottlerException: Too Many Requests'), t)).toBe('apiErrors.tooManyRequests');
    expect(mapApiError(new ApiError(500, 'Internal server error'), t)).toBe('apiErrors.server');
    expect(mapApiError(new ApiError(502, 'Request failed (502)'), t)).toBe('apiErrors.server');
  });

  it('passes through messages that are already localized', () => {
    expect(mapApiError(new ApiError(404, 'Сделка не найдена'), t)).toBe('Сделка не найдена');
    expect(mapApiError(new Error('Редактировать можно только черновик'), t)).toBe('Редактировать можно только черновик');
  });

  it('maps network problems', () => {
    expect(mapApiError(new ApiError(0, 'network'), t)).toBe('requests.networkError');
    expect(mapApiError(new ApiError(0, 'timeout'), t)).toBe('requests.timeoutError');
    expect(mapApiError(new TypeError('Failed to fetch'), t)).toBe('requests.networkError');
    expect(mapApiError('boom', t)).toBe('common.error');
  });
});

describe('isNoCompanyError', () => {
  it('is true only for no-company answers', () => {
    expect(isNoCompanyError(new ApiError(404, 'Company not found'))).toBe(true);
    expect(isNoCompanyError(new ApiError(403, 'Supplier company membership required'))).toBe(true);
    expect(isNoCompanyError(new ApiError(0, 'timeout'))).toBe(false);
    expect(isNoCompanyError(new Error('x'))).toBe(false);
  });
});
