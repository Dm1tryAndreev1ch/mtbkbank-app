/**
 * Phase 3 — Plan 03-09 — SEC-12, D-12.
 *
 * Constant-time login: phone-not-found and phone-found-wrong-pin must take
 * comparable wall-clock time (bcrypt-on-DUMMY_HASH) and return the SAME
 * AUTH_INVALID_CREDENTIALS code with the SAME Russian message
 * «Неверный телефон или ПИН-код».
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

describe('login timing parity (SEC-12, D-12)', () => {
  it('phone-not-found and phone-found-wrong-pin both return AUTH_INVALID_CREDENTIALS with same Russian message', async () => {
    const u = await prisma.user.create({
      data: {
        phone: '+79991111111',
        pin: bcrypt.hashSync('1234', 10),
        name: 'A',
        isAdmin: false,
        status: 'STANDARD',
      },
    });
    const notFound = await supertest(app)
      .post('/api/auth/login')
      .send({ phone: '+79999999999', pin: '1234' });
    const wrongPin = await supertest(app)
      .post('/api/auth/login')
      .send({ phone: u.phone, pin: '9999' });
    expect(notFound.status).toBe(401);
    expect(wrongPin.status).toBe(401);
    expect(notFound.body.error).toBe('AUTH_INVALID_CREDENTIALS');
    expect(wrongPin.body.error).toBe('AUTH_INVALID_CREDENTIALS');
    expect(notFound.body.message).toBe('Неверный телефон или ПИН-код');
    expect(wrongPin.body.message).toBe('Неверный телефон или ПИН-код');
  });

  it('wall-clock parity: not-found vs wrong-pin within ±20ms (median over 10 iterations)', async () => {
    const u = await prisma.user.create({
      data: {
        phone: '+79991111112',
        pin: bcrypt.hashSync('1234', 10),
        name: 'B',
        isAdmin: false,
        status: 'STANDARD',
      },
    });
    const N = 10;
    const tNotFound = [];
    const tWrong = [];
    for (let i = 0; i < N; i++) {
      const t1 = Date.now();
      await supertest(app)
        .post('/api/auth/login')
        .send({ phone: '+79999999990', pin: '1234' });
      tNotFound.push(Date.now() - t1);
      const t2 = Date.now();
      await supertest(app)
        .post('/api/auth/login')
        .send({ phone: u.phone, pin: '9999' });
      tWrong.push(Date.now() - t2);
    }
    const median = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const delta = Math.abs(median(tNotFound) - median(tWrong));
    // ±20ms generous; D-12 is about indistinguishability, not a hard SLA.
    expect(delta).toBeLessThanOrEqual(20);
  }, 30000);

  it('precomputed DUMMY_HASH at module load (constant cost target)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/routes/auth.js'), 'utf8');
    expect(src).toMatch(/const DUMMY_HASH\s*=\s*bcrypt\.hashSync/);
  });
});
