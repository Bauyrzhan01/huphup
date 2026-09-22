import { ApiError } from '../api/client';

/** Turns API errors into text a person can act on. */
export function authErrorText(err: unknown, mode: 'login' | 'register') {
  if (!(err instanceof ApiError)) return 'Что-то пошло не так. Попробуйте ещё раз.';
  if (err.status === 0) return err.message;
  if (mode === 'login' && err.status === 401) return 'Неверный email или пароль';
  if (mode === 'register' && err.status === 409) return 'Этот email уже зарегистрирован — войдите';
  if (err.status === 400) {
    if (/email/i.test(err.message)) return 'Проверьте email';
    if (/password/i.test(err.message)) return 'Пароль — не короче 8 символов';
    if (/fullName/i.test(err.message)) return 'Укажите имя или название компании';
  }
  if (err.status >= 500) return 'Сервер временно недоступен. Попробуйте через минуту.';
  return err.message;
}
