/**
 * Russian message codebook for AppError.
 * Per D-05: single backend codebook; clients render `message` as-is.
 * Per D-06: codes are uppercase snake_case `DOMAIN_REASON` — never magic numbers.
 * Per D-09: status code is set at the throw site, not in this file.
 *
 * NEW codes added in later phases MUST land here AND be honoured by errorNormalizer fallback.
 */
module.exports = {
  AUTH_INVALID_PIN:        'Неверный ПИН-код',
  AUTH_USER_NOT_FOUND:     'Пользователь не найден',
  // Phase 3 / SEC-12 / D-12 — single error for /auth/login regardless of which side
  // failed (phone unknown OR PIN wrong). Combined with bcrypt-on-DUMMY_HASH this
  // closes the user-enumeration side channel via timing AND error-message text.
  AUTH_INVALID_CREDENTIALS: 'Неверный телефон или ПИН-код',
  AUTH_TOKEN_INVALID:      'Сессия недействительна',
  AUTH_TOKEN_EXPIRED:      'Сессия истекла',
  // Phase 4 / 04-02 / B-M2 — distinct from AUTH_TOKEN_EXPIRED so the mobile client
  // can branch: AUTH_TOKEN_EXPIRED → silent refresh; REFRESH_TOKEN_EXPIRED → kick to login.
  REFRESH_TOKEN_EXPIRED:   'Сессия истекла, войдите снова',
  // Phase 4 / 04-02 / B-M7 — sacrifice attempt against an already-full target card.
  SACRIFICE_OVERHEAL:      'Целевая карта уже на максимуме HP',
  AUTH_FORBIDDEN:          'Доступ запрещён',
  // Phase 3 / SEC-08 / D-06 — stale admin JWT (DB says isAdmin:false or status:BLOCKED)
  ADMIN_FLAG_REVOKED:      'Сессия администратора недействительна. Войдите снова.',
  BALANCE_INSUFFICIENT:    'Недостаточно средств',
  // Phase 4.5 / 04.5-01 / ADMIN-01 — admin-frozen account; debit paths in
  // routes/transactions.js + routes/payments.js throw 423 LOCKED before any
  // side effect runs.
  ACCOUNT_FROZEN:          'Счёт заморожен; списания невозможны',
  // Phase 4.5 / 04.5-02 / ADMIN-02 — transaction reverse guards.
  TRANSACTION_NOT_REVERSIBLE:   'Операция не может быть отменена в текущем статусе',
  TRANSACTION_ALREADY_REVERSED: 'Операция уже была отменена',
  DECK_VALIDATION_FAILED:  'Колода не прошла проверку',
  RATE_LIMIT_EXCEEDED:     'Слишком много запросов. Попробуйте позже.',
  VALIDATION_FAILED:       'Проверьте введённые данные',
  DB_ERROR:                'Ошибка базы данных',
  NOT_FOUND:               'Ресурс не найден',
  INTERNAL_ERROR:          'Внутренняя ошибка сервера',
};
