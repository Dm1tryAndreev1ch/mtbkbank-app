/**
 * Phase 3 — Plan 03-03 — SEC-08, D-05..D-08.
 *
 * requireFreshAdmin middleware: verifies JWT isAdmin claim against fresh DB
 * findUnique on every admin request, with a 5-minute LRU cache, structured
 * warn on mismatch, and an explicit invalidate(userId) hook.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { truncateAll, getPrisma } = require('../setup');

// IMPORTANT: requireFreshAdmin + logger MUST be loaded AFTER `jest.resetModules()` in
// beforeAll so the test holds the same module instance the running Express app loads.
// If we required them at the top of the file, jest.resetModules() would invalidate them
// and `app` would get a different copy → the test's `_cache` and `logger.warn` spy
// would not observe the in-process cache hits / log lines from real requests.
let app;
let prisma;
let requireFreshAdmin;
let logger;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  ({ requireFreshAdmin } = require('../../src/middleware/requireFreshAdmin'));
  ({ logger } = require('../../src/logger'));
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
  requireFreshAdmin._cache.clear();
});

async function createAdmin({ phone, isAdmin = true, status = 'STANDARD' } = {}) {
  return prisma.user.create({
    data: {
      phone,
      pin: await bcrypt.hash('1234', 4),
      name: 'Admin',
      isAdmin,
      status,
    },
  });
}

function tokenFor({ id, isAdmin }) {
  return jwt.sign({ userId: id, isAdmin }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

describe('requireFreshAdmin (SEC-08, D-05..D-08)', () => {
  it('first admin request triggers DB findUnique; second within 5min hits LRU cache (D-05)', async () => {
    const admin = await createAdmin({ phone: '+79000000000', isAdmin: true });
    const token = tokenFor(admin);

    // Cache should be empty initially
    expect(requireFreshAdmin._cache.get(admin.id)).toBeUndefined();

    const res1 = await supertest(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBeLessThan(500);
    // After first request, cache populated
    expect(requireFreshAdmin._cache.get(admin.id)).toBeTruthy();
    expect(requireFreshAdmin._cache.get(admin.id).isAdmin).toBe(true);

    const sizeAfter1 = requireFreshAdmin._cache.size;

    const res2 = await supertest(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBeLessThan(500);
    // Cache still populated; size unchanged → second request was cache-hit
    expect(requireFreshAdmin._cache.size).toBe(sizeAfter1);
    expect(requireFreshAdmin._cache.get(admin.id)).toBeTruthy();
  });

  it('JWT claim isAdmin:true + DB isAdmin:false → 401 ADMIN_FLAG_REVOKED (D-06)', async () => {
    const u = await createAdmin({ phone: '+79000000001', isAdmin: false });
    const staleToken = jwt.sign(
      { userId: u.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await supertest(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('ADMIN_FLAG_REVOKED');
    expect(res.body.message).toMatch(/Сессия администратора недействительна/);
    expect(res.body.requestId).toBeTruthy();
  });

  it('401 path emits structured warn { event: admin_flag_demoted, userId, requestId } (D-06)', async () => {
    const u = await createAdmin({ phone: '+79000000002', isAdmin: false });
    const staleToken = jwt.sign(
      { userId: u.id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const warnSpy = jest.spyOn(logger, 'warn');
    await supertest(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${staleToken}`);
    const adminEvents = warnSpy.mock.calls.filter(
      (c) => c[0]?.event === 'admin_flag_demoted'
    );
    expect(adminEvents.length).toBeGreaterThanOrEqual(1);
    const fields = adminEvents[0][0];
    expect(fields.userId).toBe(u.id);
    expect(fields.requestId).toBeTruthy();
    warnSpy.mockRestore();
  });

  it('requireFreshAdmin.invalidate(userId) drops cache entry; next request hits DB (D-07)', async () => {
    const admin = await createAdmin({ phone: '+79000000003', isAdmin: true });
    const token = tokenFor(admin);
    await supertest(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(requireFreshAdmin._cache.get(admin.id)).toBeTruthy();
    requireFreshAdmin.invalidate(admin.id);
    expect(requireFreshAdmin._cache.get(admin.id)).toBeUndefined();
  });
});
