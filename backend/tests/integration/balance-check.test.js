/**
 * Phase 3 — Plan 03-05 (Wave 2) — REL-07 live tests.
 *
 * BankAccount.balance CHECK (>= 0) constraint atomicity + errorNormalizer mapping
 * for Postgres 23514 → BALANCE_INSUFFICIENT.
 *
 * Notes:
 *   - The /api/transactions/transfer route already pre-empts the CHECK constraint via an
 *     atomic `updateMany({ where: { id, balance: { gte: amount } }, ... })` guard. That
 *     means the route returns 400 with `{ error: 'Недостаточно средств на момент списания' }`
 *     for over-spend (legacy contract — not yet AppError-typed; that migration is in 03-04
 *     and downstream plans). The CHECK constraint is the *belt* under that *suspenders*; this
 *     test asserts the post-condition (balance never goes negative) holds even under heavy
 *     concurrency.
 *   - Test (a) drives the errorNormalizer mapping in isolation — that's the load-bearing
 *     assertion for plan 03-05's deliverable. Test (b) is a load test asserting atomicity.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

describe('BankAccount balance CHECK constraint (REL-07, plan 03-05)', () => {
  it('errorNormalizer maps Postgres 23514 + BankAccount_balance_nonneg_check → BALANCE_INSUFFICIENT', async () => {
    // Arrange: real account + try to drive the balance below 0 via raw update.
    const u = await prisma.user.create({
      data: { phone: '+79991111111', pin: 'h', name: 'A' },
    });
    const acc = await prisma.bankAccount.create({
      data: { userId: u.id, name: 'Main', type: 'main', balance: 100 },
    });

    let caughtErr;
    try {
      await prisma.bankAccount.update({
        where: { id: acc.id },
        data: { balance: -1 },
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeTruthy();
    // Sanity: the underlying Postgres error carries the constraint name and 23514 code.
    const errMsg = String(caughtErr.message || '');
    expect(errMsg).toMatch(/BankAccount_balance_nonneg_check/i);

    // Run through errorNormalizer manually and capture status + body.
    const { errorNormalizer } = require('../../src/errors/errorNormalizer');
    let captured;
    const fakeReq = { id: 'r-1' };
    const fakeRes = {
      _s: 200,
      status(s) {
        this._s = s;
        return this;
      },
      json(b) {
        captured = { status: this._s, body: b };
      },
    };
    errorNormalizer(caughtErr, fakeReq, fakeRes, () => {});
    expect(captured.status).toBe(400);
    expect(captured.body.error).toBe('BALANCE_INSUFFICIENT');
    expect(captured.body.message).toMatch(/Недостаточно средств/);
    // Constraint/schema names must NOT leak to client.
    expect(JSON.stringify(captured.body)).not.toContain('BankAccount_balance_nonneg_check');
  });

  it(
    '50 parallel transfers from balance-1000 account never produce negative balance',
    async () => {
      // Build sender + recipient + 1000 balance.
      const sender = await prisma.user.create({
        data: { phone: '+79991111112', pin: 'h', name: 'S' },
      });
      const recipient = await prisma.user.create({
        data: { phone: '+79991111113', pin: 'h', name: 'R' },
      });
      const senderAcc = await prisma.bankAccount.create({
        data: { userId: sender.id, name: 'Main', type: 'main', balance: 1000 },
      });
      const recipientAcc = await prisma.bankAccount.create({
        data: { userId: recipient.id, name: 'Main', type: 'main', balance: 0 },
      });

      const token = jwt.sign(
        { userId: sender.id, isAdmin: false },
        process.env.JWT_SECRET,
        { expiresIn: '15m' },
      );

      // 50 parallel transfers of 100 each — total 5000, far exceeds balance.
      const promises = Array.from({ length: 50 }, () =>
        supertest(app)
          .post('/api/transactions/transfer')
          .set('Authorization', `Bearer ${token}`)
          .send({
            fromAccountId: senderAcc.id,
            toAccountId: recipientAcc.id,
            amount: 100,
            description: 'load-test',
          }),
      );
      const results = await Promise.all(promises);

      // Post-condition: account balance >= 0 (CHECK constraint held under load).
      const finalAcc = await prisma.bankAccount.findUnique({
        where: { id: senderAcc.id },
      });
      expect(finalAcc.balance).toBeGreaterThanOrEqual(0);

      // The recipient should have received exactly the amount the sender lost.
      const finalRecipient = await prisma.bankAccount.findUnique({
        where: { id: recipientAcc.id },
      });
      expect(1000 - finalAcc.balance).toBe(finalRecipient.balance);

      // Some transfers must have succeeded (~10) and some must have failed (~40).
      const succeeded = results.filter((r) => r.status === 200);
      const failed = results.filter((r) => r.status >= 400);
      expect(succeeded.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(succeeded.length + failed.length).toBe(50);

      // Failed responses must communicate insufficient-funds semantics.
      // The legacy transfer route (pre-03-04 Zod migration) returns
      //   { error: 'Недостаточно средств на момент списания' }
      // as a string error message. After 03-04/03-05 the route may switch to AppError-typed
      // body { error: 'BALANCE_INSUFFICIENT', ... }. Accept either shape so this test is
      // robust to the in-flight route migration; either way, the client gets a typed
      // insufficient-funds signal — never DB_ERROR or a 500.
      for (const r of failed) {
        expect(r.status).toBe(400);
        const isLegacyShape =
          typeof r.body.error === 'string' && /Недостаточно средств/.test(r.body.error);
        const isTypedShape = r.body.error === 'BALANCE_INSUFFICIENT';
        expect(isLegacyShape || isTypedShape).toBe(true);
      }
    },
    30000,
  );

  it.todo('updateDeckCards is the single $transaction call site (moved to 03-11)');
});
