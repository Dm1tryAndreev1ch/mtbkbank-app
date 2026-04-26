/**
 * Phase 4 / 04-02 / B-M8 — POST /api/transactions/transfer surfaces a
 * `notificationDeferred:true` flag when prisma.notification.create throws,
 * AND logs a structured 'Notification create failed' line via pino. The
 * transfer itself MUST still succeed.
 *
 * The Express app constructs its OWN PrismaClient (backend/src/index.js
 * line 45) and exports it as `app.prisma` (added in this plan precisely
 * so integration tests can fault-inject without standing up a parallel app).
 */

const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { truncateAll, getPrisma } = require('../setup');

let app;
let testPrisma;
let appPrisma; // the prisma instance the live route handlers use

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  testPrisma = getPrisma();
  appPrisma = app.prisma;
});

afterAll(async () => {
  if (testPrisma) await testPrisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function seedTwoUsersWithBalance() {
  // Seed via the test prisma — both clients hit the same DB.
  const pinHash = await bcrypt.hash('1234', 10);
  const sender = await testPrisma.user.create({
    data: { phone: '+79993333333', pin: pinHash, name: 'Sender', isAdmin: false, status: 'STANDARD' },
  });
  const recipient = await testPrisma.user.create({
    data: { phone: '+79994444444', pin: pinHash, name: 'Recipient', isAdmin: false, status: 'STANDARD' },
  });
  const fromAccount = await testPrisma.bankAccount.create({
    data: { userId: sender.id, name: 'main', type: 'main', balance: 1000, currency: 'RUB' },
  });
  const toAccount = await testPrisma.bankAccount.create({
    data: { userId: recipient.id, name: 'main', type: 'main', balance: 0, currency: 'RUB' },
  });
  const accessToken = jwt.sign(
    { userId: sender.id, isAdmin: false },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
  return { sender, recipient, fromAccount, toAccount, accessToken };
}

describe('B-M8 — notification create failure surfacing', () => {
  test('happy path: notificationDeferred is false', async () => {
    const { fromAccount, toAccount, accessToken } = await seedTwoUsersWithBalance();
    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fromAccountId: fromAccount.id, toAccountId: toAccount.id, amount: 50 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notificationDeferred).toBe(false);
  });

  test('notification.create throws → 200 with notificationDeferred:true and structured log', async () => {
    const { fromAccount, toAccount, accessToken } = await seedTwoUsersWithBalance();

    // Fault-inject on the live app's prisma instance.
    const spy = jest
      .spyOn(appPrisma.notification, 'create')
      .mockRejectedValueOnce(new Error('boom'));

    const { logger } = require('../../src/logger');
    const errSpy = jest.spyOn(logger, 'error');

    const res = await supertest(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fromAccountId: fromAccount.id, toAccountId: toAccount.id, amount: 75 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notificationDeferred).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Structured log captured. Pino API: error(obj, msg).
    const matched = errSpy.mock.calls.some((call) => {
      const msg = call[1] || call[0];
      return typeof msg === 'string' && msg.includes('Notification create failed');
    });
    expect(matched).toBe(true);

    // Transaction itself succeeded — recipient balance increased.
    const recipient = await testPrisma.bankAccount.findUnique({ where: { id: toAccount.id } });
    expect(recipient.balance).toBe(75);
  });
});
