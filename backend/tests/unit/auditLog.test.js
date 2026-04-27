// Phase 4.5 / 04.5-01 / Task 1 — unit tests for withAudit + AUDIT_ACTIONS.
//
// These exercise the helper without touching Postgres: a stub PrismaClient
// supplies $transaction(callback) and a tx with a fake auditLog.create that
// records calls. The rollback contract is asserted by making the mutation OR
// writeAudit throw and verifying nothing was "committed" (the stub tracks
// commit via a `committed` flag we only flip after $transaction resolves
// without throwing — mirroring real Prisma semantics).

const auditLog = require('../../src/services/auditLog');

function makeStubPrisma() {
  const calls = [];
  let committed = false;
  const tx = {
    auditLog: {
      create: jest.fn(async (args) => {
        calls.push({ kind: 'auditLog.create', args });
        return { id: 'audit-1', ...args.data };
      }),
    },
    user: {
      update: jest.fn(async (args) => {
        calls.push({ kind: 'user.update', args });
        return { id: args.where.id, ...args.data };
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (cb) => {
      try {
        const result = await cb(tx);
        committed = true;
        return result;
      } catch (err) {
        committed = false;
        throw err;
      }
    }),
  };
  return { prisma, tx, calls, isCommitted: () => committed };
}

describe('withAudit', () => {
  test('Test 1 — commits both mutation and writeAudit when fn resolves; rolls back when fn throws', async () => {
    // Success path
    const ok = makeStubPrisma();
    const result = await auditLog.withAudit(
      ok.prisma,
      { actorId: 'admin-1', action: 'USER_UPDATE', targetType: 'User', targetId: 'u-1' },
      async (tx) => {
        return tx.user.update({ where: { id: 'u-1' }, data: { name: 'New' } });
      }
    );
    expect(result).toEqual({ id: 'u-1', name: 'New' });
    // Order: user.update first, auditLog.create second
    const kinds = ok.calls.map((c) => c.kind);
    expect(kinds).toEqual(['user.update', 'auditLog.create']);
    expect(ok.isCommitted()).toBe(true);

    // Failure path — mutation throws
    const fail = makeStubPrisma();
    await expect(
      auditLog.withAudit(
        fail.prisma,
        { actorId: 'admin-1', action: 'USER_UPDATE', targetType: 'User', targetId: 'u-1' },
        async () => {
          throw new Error('boom');
        }
      )
    ).rejects.toThrow('boom');
    // No mutation calls reached the tx; auditLog.create was never called
    expect(fail.calls.length).toBe(0);
    expect(fail.isCommitted()).toBe(false);

    // Failure path — writeAudit throws (monkey-patch)
    const auditFail = makeStubPrisma();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = jest.fn(async () => {
      throw new Error('audit_failed');
    });
    try {
      await expect(
        auditLog.withAudit(
          auditFail.prisma,
          { actorId: 'admin-1', action: 'USER_UPDATE', targetType: 'User', targetId: 'u-1' },
          async (tx) => tx.user.update({ where: { id: 'u-1' }, data: { name: 'X' } })
        )
      ).rejects.toThrow('audit_failed');
    } finally {
      auditLog.writeAudit = original;
    }
    // The mutation ran but the surrounding $transaction rejected → not committed.
    expect(auditFail.isCommitted()).toBe(false);
  });

  test('Test 2 — setAudit({ before, after }) merges into ctxBase before writeAudit fires', async () => {
    const stub = makeStubPrisma();
    const ctx = { actorId: 'admin-1', action: 'USER_UPDATE', targetType: 'User', targetId: 'u-1', requestId: 'req-1' };
    await auditLog.withAudit(stub.prisma, ctx, async (tx, setAudit) => {
      const after = await tx.user.update({ where: { id: 'u-1' }, data: { name: 'New' } });
      setAudit({ before: { id: 'u-1', name: 'Old' }, after });
      return after;
    });
    const auditCall = stub.calls.find((c) => c.kind === 'auditLog.create');
    expect(auditCall).toBeDefined();
    // writeAudit ran payload-scrubbing on before/after; assert the merged ctx made it through.
    expect(auditCall.args.data.actorId).toBe('admin-1');
    expect(auditCall.args.data.action).toBe('USER_UPDATE');
    expect(auditCall.args.data.targetType).toBe('User');
    expect(auditCall.args.data.targetId).toBe('u-1');
    expect(auditCall.args.data.requestId).toBe('req-1');
    expect(auditCall.args.data.payload.before).toEqual({ id: 'u-1', name: 'Old' });
    expect(auditCall.args.data.payload.after).toEqual({ id: 'u-1', name: 'New' });
  });

  test('Test 3 — AUDIT_ACTIONS is frozen and contains all required codes', () => {
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
    // Mutation attempt is silently ignored (frozen object) in non-strict mode.
    expect(() => {
      'use strict';
      auditLog.AUDIT_ACTIONS.ACCOUNT_FREEZE = 'BAD';
    }).toThrow();
  });

  test('Test 4 — module exports surface unchanged for existing consumers', () => {
    expect(typeof auditLog.writeAudit).toBe('function');
    expect(typeof auditLog.withAudit).toBe('function');
    expect(typeof auditLog.scrubObject).toBe('function');
    expect(typeof auditLog.scrubString).toBe('function');
    expect(typeof auditLog.AUDIT_ACTIONS).toBe('object');
  });
});
