/**
 * Phase 2 — Plan 02-11 — Task 2
 *
 * TEST-02: supertest coverage of /api/transactions transfer + list (happy paths).
 * Phase 3 expands to negative-balance + concurrent transfer load (REL-* + SEC-*).
 *
 * Contract notes (read from backend/src/routes/transactions.js):
 *   - Transfer endpoint is POST /api/transactions/transfer.
 *   - Phone-based mode uses `recipient` (not `recipientPhone`).
 *   - Response on transfer success: { success: true, transaction: <transOut> }.
 *   - List endpoint GET /api/transactions returns
 *     { transactions, total, limit, offset }.
 *   - Both routes are gated by authMiddleware → require Authorization: Bearer <jwt>.
 */

const supertest = require('supertest');
const bcrypt = require('bcryptjs');
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

async function loginNewUserWithAccount({
  phone = '+79991110001',
  pin = '1234',
  balance = 100000,
} = {}) {
  const pinHash = await bcrypt.hash(pin, 10);
  const user = await prisma.user.create({
    data: { phone, pin: pinHash, name: 'TX Sender', isAdmin: false, status: 'STANDARD' },
  });
  const account = await prisma.bankAccount.create({
    data: { userId: user.id, name: 'Главный счёт', type: 'main', balance, currency: 'RUB' },
  });
  // Recipient lives in a different user with a main account so the self-transfer
  // guard in the transfer route doesn't fire.
  const recipUser = await prisma.user.create({
    data: {
      phone: '+79992220002',
      pin: await bcrypt.hash('0000', 10),
      name: 'TX Recip',
      isAdmin: false,
      status: 'STANDARD',
    },
  });
  const recipAccount = await prisma.bankAccount.create({
    data: { userId: recipUser.id, name: 'Главный счёт', type: 'main', balance: 0, currency: 'RUB' },
  });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ phone, pin });
  expect(res.status).toBe(200);
  return {
    accessToken: res.body.accessToken,
    user, account, recipUser, recipAccount,
  };
}

describe('POST /api/transactions/transfer', () => {
  test('happy path: returns 200 + persists TRANSFER_OUT + TRANSFER_IN rows', async () => {
    const { accessToken, account, recipUser } = await loginNewUserWithAccount();
    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fromAccountId: account.id, recipient: recipUser.phone, amount: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.type).toBe('TRANSFER_OUT');
    // The route writes both TRANSFER_OUT (sender) + TRANSFER_IN (recipient) inside
    // the same prisma.$transaction — both rows must be present.
    const out = await prisma.transaction.count({ where: { type: 'TRANSFER_OUT' } });
    const incoming = await prisma.transaction.count({ where: { type: 'TRANSFER_IN' } });
    expect(out).toBe(1);
    expect(incoming).toBe(1);
  });

  test('insufficient balance: returns 400 + Russian error + ZERO transaction rows', async () => {
    const { accessToken, account, recipUser } = await loginNewUserWithAccount({ balance: 100 });
    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fromAccountId: account.id, recipient: recipUser.phone, amount: 99999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Недостаточно/);
    const totalRows = await prisma.transaction.count();
    expect(totalRows).toBe(0); // Atomic guard rolled the whole transfer back.
  });

  test('unauthenticated: returns 401', async () => {
    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .send({ fromAccountId: 'whatever', recipient: '+70000000000', amount: 100 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/transactions', () => {
  test('happy path: returns 200 + { transactions, total, limit, offset }', async () => {
    const { accessToken } = await loginNewUserWithAccount();
    const res = await supertest(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
  });

  test('after a transfer: list returns the TRANSFER_OUT row', async () => {
    const { accessToken, account, recipUser } = await loginNewUserWithAccount();
    await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fromAccountId: account.id, recipient: recipUser.phone, amount: 250 });
    const res = await supertest(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);
    const txOut = res.body.transactions.find((t) => t.type === 'TRANSFER_OUT');
    expect(txOut).toBeDefined();
    expect(txOut.amount).toBe(250);
  });
});
