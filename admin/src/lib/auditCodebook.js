// admin/src/lib/auditCodebook.js
//
// Phase 4.5 / 04.5-01 / Task 5 — admin audit-action codebook.
//
// Maps the English snake-uppercase `action` codes stored in the AuditLog
// table (CONTEXT D-05) to the Russian display labels rendered by the Plan-4
// dashboard widget (UI-SPEC §"Audit-Log Dashboard Widget"). Also exports
// `actionIsDestructive(code)` — controls the optional red-dot marker.
//
// Unknown codes pass through verbatim with `isDestructive=false`.

export const AUDIT_ACTION_LABELS = Object.freeze({
  ACCOUNT_FREEZE:           { label: 'Заморозка счёта',                 destructive: true },
  ACCOUNT_UNFREEZE:         { label: 'Разморозка счёта',                destructive: false },
  ACCOUNT_BALANCE_ADJUST:   { label: 'Корректировка баланса',           destructive: true },
  TRANSACTION_REVERSE:      { label: 'Отмена операции',                 destructive: true },
  BANKCARD_BLOCK:           { label: 'Блокировка банковской карты',     destructive: true },
  BANKCARD_UNBLOCK:         { label: 'Разблокировка банковской карты',  destructive: false },
  BANKCARD_ISSUE:           { label: 'Выпуск банковской карты',         destructive: false },
  BANKCARD_DELETE:          { label: 'Удаление банковской карты',       destructive: true },
  USERCARD_GRANT:           { label: 'Выдача карты-коллекции',          destructive: false },
  USERCARD_REVOKE:          { label: 'Изъятие карты-коллекции',         destructive: true },
  USERCARD_HP_EDIT:         { label: 'Изменение HP карты',              destructive: true },
  DECK_BREAK_ACTIVE:        { label: 'Сброс активной колоды',           destructive: true },
  QUEST_CREATE:             { label: 'Создание квеста',                 destructive: false },
  QUEST_UPDATE:             { label: 'Изменение квеста',                destructive: false },
  QUEST_DEACTIVATE:         { label: 'Деактивация квеста',              destructive: true },
  QUEST_DELETE:             { label: 'Удаление квеста',                 destructive: true },
  USERQUEST_RESET:          { label: 'Сброс прогресса квеста',          destructive: true },
  LIMIT_CREATE:             { label: 'Создание лимита',                 destructive: false },
  LIMIT_UPDATE:             { label: 'Изменение лимита',                destructive: false },
  LIMIT_DELETE:             { label: 'Удаление лимита',                 destructive: true },
  PAYMENT_STATUS_OVERRIDE:  { label: 'Изменение статуса платежа',       destructive: true },
  SUBSCRIPTION_CREATE:      { label: 'Создание подписки',               destructive: false },
  SUBSCRIPTION_UPDATE:      { label: 'Изменение подписки',              destructive: false },
  SUBSCRIPTION_DELETE:      { label: 'Удаление подписки',               destructive: true },
  NOTIFICATION_BROADCAST:   { label: 'Рассылка уведомлений',            destructive: false },
  TRADE_CANCEL:             { label: 'Отмена обмена',                   destructive: true },
  USER_SOFT_DELETE:         { label: 'Архивация пользователя',          destructive: true },
  USER_HARD_DELETE:         { label: 'Удаление пользователя навсегда',  destructive: true },
});

export function actionToRussianLabel(code) {
  const entry = AUDIT_ACTION_LABELS[code];
  return entry ? entry.label : code;
}

export function actionIsDestructive(code) {
  const entry = AUDIT_ACTION_LABELS[code];
  return entry ? entry.destructive : false;
}
