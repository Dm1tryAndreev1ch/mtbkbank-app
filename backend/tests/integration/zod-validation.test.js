/**
 * Phase 3 — Plan 03-04 — SEC-09, SEC-10, D-09..D-11.
 *
 * Zod-driven request validation: VALIDATION_FAILED contract with issues[],
 * shared phone/PIN/Luhn refines, user-search q-min-length.
 *
 * Wave-0 todos (plan 03-00) are flipped to live tests here. Routes are NOT yet
 * wired to reqValidator — that lands in 03-09/03-10/03-11 — so these tests
 * invoke the schemas + middleware directly without supertest.
 */

const { loginSchema, registerSchema } = require('../../src/schemas/auth');
const { transferSchema } = require('../../src/schemas/transactions');
const { deckUpdateSchema } = require('../../src/schemas/decks');
const { userSearchQuerySchema } = require('../../src/schemas/users');
const { reqValidator } = require('../../src/middleware/reqValidator');

describe('Zod validation (SEC-09, SEC-10, D-09..D-11)', () => {
  it('VALIDATION_FAILED returns issues array via reqValidator middleware (D-10)', (done) => {
    const mw = reqValidator(loginSchema);
    const req = { body: { phone: 'bad', pin: '12' } };
    mw(req, null, (err) => {
      try {
        expect(err).toBeTruthy();
        expect(err.code).toBe('VALIDATION_FAILED');
        expect(err.status).toBe(400);
        expect(Array.isArray(err.issues)).toBe(true);
        expect(err.issues.length).toBeGreaterThanOrEqual(2);
        // Each issue exposes path/code/message — D-10 contract
        for (const i of err.issues) {
          expect(Array.isArray(i.path)).toBe(true);
          expect(typeof i.code).toBe('string');
          expect(typeof i.message).toBe('string');
        }
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('reqValidator passes through and sets req.validated on success', (done) => {
    const mw = reqValidator(loginSchema);
    const req = { body: { phone: '+79001234567', pin: '1234' } };
    mw(req, null, (err) => {
      try {
        expect(err).toBeFalsy();
        expect(req.validated).toEqual({ phone: '+79001234567', pin: '1234' });
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('register rejects card number failing Luhn refine with issues[].path including cardNumber (D-11)', () => {
    const result = registerSchema.safeParse({
      firstName: 'Иван',
      lastName: 'Иванов',
      phone: '+79001234567',
      pin: '1234',
      cardNumber: '4111111111111112', // bad luhn
    });
    expect(result.success).toBe(false);
    const luhnIssue = result.error.issues.find((i) => i.path[0] === 'cardNumber');
    expect(luhnIssue).toBeTruthy();
  });

  it('register accepts a valid Luhn card number (D-11 single-source)', () => {
    const result = registerSchema.safeParse({
      firstName: 'Иван',
      lastName: 'Иванов',
      phone: '+79001234567',
      pin: '1234',
      cardNumber: '4111111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('transfer rejects negative amount with issues path === [amount] (D-11)', () => {
    const result = transferSchema.safeParse({
      fromAccountId: 'a1',
      toUserId: 'u1',
      amount: -5,
    });
    expect(result.success).toBe(false);
    const amountIssue = result.error.issues.find((i) => i.path[0] === 'amount');
    expect(amountIssue).toBeTruthy();
  });

  it('transfer rejects zero amount (amountSchema is positive) (D-11)', () => {
    const result = transferSchema.safeParse({
      fromAccountId: 'a1',
      toUserId: 'u1',
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('phone regex requires +\\d{11,15} format (D-11)', () => {
    expect(loginSchema.safeParse({ phone: '+7900', pin: '1234' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '79001234567', pin: '1234' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '+79001234567', pin: '1234' }).success).toBe(true);
  });

  it('PIN regex requires exactly 4 digits (D-11)', () => {
    expect(loginSchema.safeParse({ phone: '+79001234567', pin: '12' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '+79001234567', pin: 'abcd' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '+79001234567', pin: '12345' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '+79001234567', pin: '1234' }).success).toBe(true);
  });

  it('user-search query rejects q.length < 10 (D-11, SEC-09)', () => {
    expect(userSearchQuerySchema.safeParse({ q: 'short' }).success).toBe(false);
    expect(userSearchQuerySchema.safeParse({ q: '123456789' }).success).toBe(false); // exactly 9 chars
    expect(userSearchQuerySchema.safeParse({ q: 'longenough123' }).success).toBe(true);
  });

  it('deckUpdateSchema rejects cardIds.length > 5', () => {
    expect(deckUpdateSchema.safeParse({ cardIds: ['1', '2', '3', '4', '5', '6'] }).success).toBe(false);
    expect(deckUpdateSchema.safeParse({ cardIds: ['1', '2', '3', '4', '5'] }).success).toBe(true);
    expect(deckUpdateSchema.safeParse({ cardIds: [] }).success).toBe(true); // empty allowed (clears deck)
  });
});
