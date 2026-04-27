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
  // Phase 4.5 / 04.5-01 / ADMIN-01 — admin-frozen account.
  ACCOUNT_FROZEN:       'Счёт заморожен; списания невозможны',
  // Phase 4.5 / 04.5-02 / ADMIN-02 — transaction reverse guards.
  TRANSACTION_NOT_REVERSIBLE:   'Операция не может быть отменена в текущем статусе',
  TRANSACTION_ALREADY_REVERSED: 'Операция уже была отменена',
  NOT_FOUND: 'Запись не найдена',
  // Phase 4.5 / 04.5-04 / ADMIN-10 — notification broadcast: no recipients matched.
  NOTIFICATION_NO_RECIPIENTS: 'Получатели не найдены',
  // Phase 4.5 / 04.5-04 / ADMIN-11 — trade cancel: trade is not in PENDING status.
  TRADE_NOT_CANCELLABLE: 'Обмен нельзя отменить в текущем статусе',
  // Phase 4.5 / 04.5-05 / ADMIN-12 — user soft/hard delete (Plan 5).
  USER_ALREADY_DELETED:       'Пользователь уже архивирован',
  USER_SELF_DELETE_FORBIDDEN: 'Невозможно удалить самого себя',
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
