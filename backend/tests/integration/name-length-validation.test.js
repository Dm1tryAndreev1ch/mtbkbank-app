/**
 * Phase 4 / 04-02 / B-M3 — POST /auth/register firstName/lastName bounds.
 *
 * Pins the schemas/auth.js nameSchema = z.string().min(2).max(80) contract via
 * the live registerSchema chain (reqValidator → handler).
 */

const supertest = require('supertest');
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

const VALID_TEST_PAN = '4111111111111111';

function payload(overrides) {
  return {
    firstName: 'Тест',
    lastName: 'Юзер',
    phone: '+79991234567',
    pin: '1234',
    cardNumber: VALID_TEST_PAN,
    ...overrides,
  };
}

describe('B-M3 — register name length bounds', () => {
  test('firstName length 1 → 400 VALIDATION_FAILED with firstName issue', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send(payload({ firstName: 'X' }));
    expect(res.status).toBe(400);
    // 03-09 contract: errorNormalizer surfaces error code as 'error' field.
    const body = res.body || {};
    const blob = JSON.stringify(body);
    expect(blob).toMatch(/VALIDATION/i);
    expect(blob).toMatch(/firstName/i);
  });

  test('firstName length 81 → 400 VALIDATION_FAILED', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send(payload({ firstName: 'A'.repeat(81) }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body || {})).toMatch(/firstName/i);
  });

  test('lastName length 1 → 400 VALIDATION_FAILED', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send(payload({ lastName: 'Y' }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body || {})).toMatch(/lastName/i);
  });

  test('boundary lengths 2 and 80 → 201', async () => {
    const res2 = await supertest(app)
      .post('/api/auth/register')
      .send(payload({ firstName: 'XY', phone: '+79991111111' }));
    expect(res2.status).toBe(201);

    const res80 = await supertest(app)
      .post('/api/auth/register')
      .send(payload({ firstName: 'A'.repeat(80), phone: '+79992222222' }));
    expect(res80.status).toBe(201);
  });
});
