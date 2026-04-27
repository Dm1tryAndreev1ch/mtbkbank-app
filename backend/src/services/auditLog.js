// backend/src/services/auditLog.js
//
// Phase 3 / SEC-14 / D-01..D-04
//
// writeAudit(tx, ...) writes an AuditLog row inside the CALLER's prisma.$transaction handle.
// If this throws, the surrounding $transaction rolls back — that's the D-03 rollback contract
// every admin mutation in 03-10 relies on (Phase 4.5 success-criterion 4 also depends on it).
//
// Forbidden keys (pin/password/cardNumber/Authorization/refreshToken/cookie) are scrubbed via
// the SAME helpers Sentry's beforeSend uses. Single source of truth (D-02 lockstep mandate;
// Pitfall 2 guard pinned by tests/audit-scrub-parity.test.js identity assertion).
//
// Note: the Sentry init module's actual filename is `instrument.js` (not `sentry.js` — the
// PLAN prose used the conceptual name). scrubObject/scrubString are exported from there
// since Phase 1.

const { scrubObject, scrubString } = require('../instrument');

async function writeAudit(tx, {
  actorId,
  action,
  targetType,
  targetId,
  before,
  after,
  reason,
  requestId,
}) {
  if (!tx || typeof tx.auditLog?.create !== 'function') {
    throw new Error('writeAudit: first argument must be a Prisma transaction handle (tx)');
  }
  if (!actorId || !action || !targetType) {
    throw new Error('writeAudit: actorId, action, targetType are required');
  }

  const payload = {
    before: before ? scrubObject(before) : undefined,
    after: after ? scrubObject(after) : undefined,
    reason: reason || undefined,
  };

  return tx.auditLog.create({
    data: {
      actorId,
      action,
      targetType,
      targetId: targetId || null,
      payload,
      requestId: requestId || null,
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 4.5 / 04.5-01 / D-03 — withAudit() helper.
//
// Wraps a caller-supplied mutation closure inside prisma.$transaction and
// fires writeAudit(tx, ...) inside the same tx so that a thrown writeAudit
// (or thrown mutation) rolls BOTH back atomically. Plans 2-6 use this helper
// for every admin mutation route; the D-04 rollback regression test (Plan 6)
// monkey-patches `auditLog.writeAudit` to throw and asserts no DB state moves.
//
// Two-arg closure form so callers can call setAudit({ before, after }) AFTER
// intra-tx reads complete (e.g., capture the row's pre-update state before
// running tx.user.update). Anything passed to setAudit is shallow-merged into
// ctxBase before writeAudit fires.
// ---------------------------------------------------------------------------
async function withAudit(prisma, ctxBase, mutationFn) {
  return prisma.$transaction(async (tx) => {
    let auditExtras = {};
    const setAudit = (extras) => {
      auditExtras = { ...auditExtras, ...extras };
    };
    const result = await mutationFn(tx, setAudit);
    // Reference module.exports.writeAudit so monkey-patches in tests apply
    // (Pitfall 2 — destructured imports freeze the reference; the rollback
    // test in Plan 6 swaps writeAudit at runtime).
    await module.exports.writeAudit(tx, { ...ctxBase, ...auditExtras });
    return result;
  });
}

// ---------------------------------------------------------------------------
// Phase 4.5 / 04.5-01 / D-05 — AUDIT_ACTIONS codebook.
//
// Snake-uppercase DOMAIN_VERB strings. Reviewed at PR — new admin endpoint
// = new entry. Frozen so code paths cannot mutate the constants at runtime.
// ---------------------------------------------------------------------------
const AUDIT_ACTIONS = Object.freeze({
  ACCOUNT_FREEZE: 'ACCOUNT_FREEZE',
  ACCOUNT_UNFREEZE: 'ACCOUNT_UNFREEZE',
  ACCOUNT_BALANCE_ADJUST: 'ACCOUNT_BALANCE_ADJUST',
  TRANSACTION_REVERSE: 'TRANSACTION_REVERSE',
  BANKCARD_BLOCK: 'BANKCARD_BLOCK',
  BANKCARD_UNBLOCK: 'BANKCARD_UNBLOCK',
  BANKCARD_ISSUE: 'BANKCARD_ISSUE',
  BANKCARD_DELETE: 'BANKCARD_DELETE',
  USERCARD_GRANT: 'USERCARD_GRANT',
  USERCARD_REVOKE: 'USERCARD_REVOKE',
  USERCARD_HP_EDIT: 'USERCARD_HP_EDIT',
  DECK_BREAK_ACTIVE: 'DECK_BREAK_ACTIVE',
  QUEST_CREATE: 'QUEST_CREATE',
  QUEST_UPDATE: 'QUEST_UPDATE',
  QUEST_DEACTIVATE: 'QUEST_DEACTIVATE',
  QUEST_DELETE: 'QUEST_DELETE',
  USERQUEST_RESET: 'USERQUEST_RESET',
  LIMIT_CREATE: 'LIMIT_CREATE',
  LIMIT_UPDATE: 'LIMIT_UPDATE',
  LIMIT_DELETE: 'LIMIT_DELETE',
  PAYMENT_STATUS_OVERRIDE: 'PAYMENT_STATUS_OVERRIDE',
  SUBSCRIPTION_CREATE: 'SUBSCRIPTION_CREATE',
  SUBSCRIPTION_UPDATE: 'SUBSCRIPTION_UPDATE',
  SUBSCRIPTION_DELETE: 'SUBSCRIPTION_DELETE',
  NOTIFICATION_BROADCAST: 'NOTIFICATION_BROADCAST',
  TRADE_CANCEL: 'TRADE_CANCEL',
  USER_HARD_DELETE: 'USER_HARD_DELETE',
  USER_SOFT_DELETE: 'USER_SOFT_DELETE',
  // Grandfathered codes already in use by routes/admin.js prior to 4.5:
  USER_UPDATE: 'USER_UPDATE',
  USER_CREATE: 'USER_CREATE',
  CARD_TEMPLATE_CREATE: 'CARD_TEMPLATE_CREATE',
  CARD_TEMPLATE_UPDATE: 'CARD_TEMPLATE_UPDATE',
  CARD_TEMPLATE_DELETE: 'CARD_TEMPLATE_DELETE',
  CARD_GRANT: 'CARD_GRANT',
  TRANSACTION_SIMULATE: 'TRANSACTION_SIMULATE',
});

module.exports = { writeAudit, withAudit, scrubObject, scrubString, AUDIT_ACTIONS };
