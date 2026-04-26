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

module.exports = { writeAudit, scrubObject, scrubString };
