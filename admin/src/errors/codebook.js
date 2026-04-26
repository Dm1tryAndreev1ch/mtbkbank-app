/**
 * Phase 3 — Plan 03-16 — SEC-07.
 *
 * Admin-side Russian codebook. Keys MUST mirror backend AppError.code values
 * (see backend/src/errors/messages.js). Adding a backend code without an
 * entry here is a SEC-07 contract violation — formatPageError will fall
 * through to GENERIC and the missing code will surface in console only.
 *
 * Length cap (MAX_LEN) prevents log-bomb / XSS via unsafe long payloads.
 */
export const CODEBOOK = Object.freeze({
  // Auth
  AUTH_INVALID_CREDENTIALS: 'Неверный телефон или ПИН-код',
  AUTH_INVALID_PIN:         'Неверный ПИН-код',
  AUTH_USER_NOT_FOUND:      'Пользователь не найден',
  AUTH_TOKEN_INVALID:       'Сессия истекла. Войдите заново.',
  AUTH_TOKEN_EXPIRED:       'Сессия истекла. Войдите заново.',
  AUTH_TOKEN_MISSING:       'Требуется авторизация. Войдите в систему.',
  AUTH_FORBIDDEN:           'Недостаточно прав для этой операции',
  ADMIN_FLAG_REVOKED:       'Права администратора отозваны. Войдите заново.',

  // Validation
  VALIDATION_FAILED: 'Проверьте поля формы — есть некорректные значения',
  DECK_VALIDATION_FAILED: 'Колода не прошла проверку',

  // Rate limits
  RATE_LIMIT_EXCEEDED: 'Слишком много запросов. Попробуйте позже.',

  // Domain
  BALANCE_INSUFFICIENT: 'Недостаточно средств на счёте',
  NOT_FOUND: 'Запись не найдена',
  CONFLICT: 'Конфликт данных. Обновите страницу и попробуйте снова.',
  DB_ERROR: 'Ошибка базы данных. Попробуйте позже.',

  // Generic
  INTERNAL_ERROR: 'Внутренняя ошибка сервера. Попробуйте позже.',
  GENERIC: 'Произошла ошибка. Попробуйте позже.',
});

const MAX_LEN = 240;

export function lookup(code) {
  const msg = CODEBOOK[code] || CODEBOOK.GENERIC;
  return msg.length > MAX_LEN ? msg.slice(0, MAX_LEN) : msg;
}
