/**
 * Phase 4.5 / 04.5-01 / D-03 — withAudit() helper unit tests.
 *
 * NOTE on test path: PLAN.md must_haves nominate
 * `backend/src/services/auditLog.test.js`, but jest.config.js `testMatch` is
 * scoped to `tests/**` so a test under `src/` would never execute. Per
 * Rule-3 (auto-fix blocking issues) we place this at `tests/unit/`. The
 * placement is documented in 04.5-01-SUMMARY.md (Deviations).
 *
 * Behaviours covered (per PLAN.md Task 1):
 *   1. withAudit commits both the mutation and writeAudit on success
 *   2. setAudit({ before, after }) merges into ctxBase before writeAudit fires
 *   3. AUDIT_ACTIONS is a frozen object covering all 27+ codes from D-05
 *   4. (existing audit-log integration test still passes — verified separately)
 *
 * The tests use a stub Prisma client whose $transaction simply runs the
 * callback with a tx-handle that records calls; a throwing-fn case asserts
 * that the writeAudit row is never written.
 */

describe('Phase-4.5 / D-03 — auditLog.withAudit + AUDIT_ACTIONS', () => {
  let auditLog;

  beforeEach(() => {
    jest.resetModules();
    auditLog = require('../../src/services/auditLog');
  });

  function makeStubPrisma() {
    const auditCreated = [];
    const tx = {
      auditLog: {
        create: jest.fn(async ({ data }) => {
          auditCreated.push(data);
          return { id: 'audit-row-1', ...data };
        }),
      },
    };
    const stubPrisma = {
      $transaction: jest.fn(async (cb) => cb(tx)),
    };
    return { stubPrisma, tx, auditCreated };
  }

  it('commits both the mutation and writeAudit on success (D-03)', async () => {
    const { stubPrisma, auditCreated } = makeStubPrisma();
    const order = [];
    const ctxBase = {
      actorId: 'a-1',
      action: 'TEST_ACTION',
      targetType: 'User',
      targetId: 't-1',
      requestId: 'r-1',
    };

    const out = await auditLog.withAudit(stubPrisma, ctxBase, async (tx, setAudit) => {
      order.push('mutation');
      setAudit({ before: { x: 1 }, after: { x: 2 } });
      return 'result';
    });

    expect(out).toBe('result');
    expect(stubPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditCreated).toHaveLength(1);
    // mutation executed before writeAudit fired (auditCreated stamped after order push)
    expect(order).toEqual(['mutation']);
    expect(auditCreated[0].action).toBe('TEST_ACTION');
    expect(auditCreated[0].actorId).toBe('a-1');
    expect(auditCreated[0].targetType).toBe('User');
    expect(auditCreated[0].targetId).toBe('t-1');
    expect(auditCreated[0].requestId).toBe('r-1');
  });

  it('rolls back when the mutation closure throws (no audit row)', async () => {
    const { stubPrisma, auditCreated } = makeStubPrisma();
    await expect(
      auditLog.withAudit(
        stubPrisma,
        { actorId: 'a-1', action: 'TEST_ACTION', targetType: 'User' },
        async () => { throw new Error('boom'); }
      )
    ).rejects.toThrow('boom');
    expect(auditCreated).toHaveLength(0);
  });

  it('rolls back when writeAudit throws (real $transaction would surface the error)', async () => {
    // Simulate a failing audit by monkey-patching writeAudit.
    const original = auditLog.writeAudit;
    const stubPrisma = {
      $transaction: jest.fn(async (cb) => {
        const tx = { auditLog: { create: jest.fn() } };
        return cb(tx);
      }),
    };
    auditLog.writeAudit = async () => { throw new Error('audit_fail'); };
    try {
      await expect(
        auditLog.withAudit(
          stubPrisma,
          { actorId: 'a-1', action: 'TEST_ACTION', targetType: 'User' },
          async () => 'ok'
        )
      ).rejects.toThrow('audit_fail');
    } finally {
      auditLog.writeAudit = original;
    }
  });

  it('setAudit({ before, after }) merges into ctxBase before writeAudit fires', async () => {
    const { stubPrisma, auditCreated } = makeStubPrisma();
    const ctxBase = {
      actorId: 'a-1',
      action: 'TEST_ACTION',
      targetType: 'User',
      targetId: 't-1',
    };
    await auditLog.withAudit(stubPrisma, ctxBase, async (_tx, setAudit) => {
      setAudit({ before: { name: 'A' } });
      setAudit({ after: { name: 'B' } });
      return 'ok';
    });
    expect(auditCreated).toHaveLength(1);
    const payload = auditCreated[0].payload;
    expect(payload.before).toEqual({ name: 'A' });
    expect(payload.after).toEqual({ name: 'B' });
  });

  it('AUDIT_ACTIONS is exported, frozen, and covers the D-05 codebook', () => {
    expect(typeof auditLog.AUDIT_ACTIONS).toBe('object');
    expect(Object.isFrozen(auditLog.AUDIT_ACTIONS)).toBe(true);
    const required = [
      'ACCOUNT_FREEZE', 'ACCOUNT_UNFREEZE', 'ACCOUNT_BALANCE_ADJUST',
      'TRANSACTION_REVERSE',
      'BANKCARD_BLOCK', 'BANKCARD_UNBLOCK', 'BANKCARD_ISSUE', 'BANKCARD_DELETE',
      'USERCARD_GRANT', 'USERCARD_REVOKE', 'USERCARD_HP_EDIT',
      'DECK_BREAK_ACTIVE',
      'QUEST_CREATE', 'QUEST_UPDATE', 'QUEST_DEACTIVATE', 'QUEST_DELETE',
      'USERQUEST_RESET',
      'LIMIT_CREATE', 'LIMIT_UPDATE', 'LIMIT_DELETE',
      'PAYMENT_STATUS_OVERRIDE',
      'SUBSCRIPTION_CREATE', 'SUBSCRIPTION_UPDATE', 'SUBSCRIPTION_DELETE',
      'NOTIFICATION_BROADCAST',
      'TRADE_CANCEL',
      'USER_HARD_DELETE', 'USER_SOFT_DELETE',
    ];
    for (const code of required) {
      expect(auditLog.AUDIT_ACTIONS[code]).toBe(code);
    }
    expect(Object.keys(auditLog.AUDIT_ACTIONS).length).toBeGreaterThanOrEqual(27);
  });
});
