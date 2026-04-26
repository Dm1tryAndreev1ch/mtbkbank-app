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
  AUTH_TOKEN_INVALID:      'Сессия недействительна',
  AUTH_TOKEN_EXPIRED:      'Сессия истекла',
  AUTH_FORBIDDEN:          'Доступ запрещён',
  // Phase 3 / SEC-08 / D-06 — stale admin JWT (DB says isAdmin:false or status:BLOCKED)
  ADMIN_FLAG_REVOKED:      'Сессия администратора недействительна. Войдите снова.',
  BALANCE_INSUFFICIENT:    'Недостаточно средств',
  DECK_VALIDATION_FAILED:  'Колода не прошла проверку',
  RATE_LIMIT_EXCEEDED:     'Слишком много запросов. Попробуйте позже.',
  VALIDATION_FAILED:       'Проверьте введённые данные',
  DB_ERROR:                'Ошибка базы данных',
  NOT_FOUND:               'Ресурс не найден',
  INTERNAL_ERROR:          'Внутренняя ошибка сервера',
};
