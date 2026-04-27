/**
 * Phase 4.5 / 04.5-05 / ADMIN-12 — soft-delete coverage.
 *
 * Pins:
 *   1. DELETE /api/admin/users/:id (no mode param) defaults to mode=soft.
 *   2. ?mode=soft sets User.deletedAt and writes a USER_SOFT_DELETE audit row.
 *   3. Already-soft-deleted user → 409 USER_ALREADY_DELETED.
 *   4. GET /api/admin/users (paged list) excludes soft-deleted users.
 *   5. DELETE /api/admin/users/:id?mode=invalid → 400 VALIDATION_FAILED.
 *   6. DELETE /api/admin/users/:non-existent?mode=soft → 404 NOT_FOUND.
 *   7. writeAudit-rollback: tx rolls back, deletedAt stays null, no audit row.
 *   8. PUT /:id on a soft-deleted user → 404 NOT_FOUND (deletedAt:null filter).
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;
let auditLog;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  auditLog = require('../../src/services/auditLog');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

async function seedAdminAndTargets() {
  const admin = await prisma.user.create({
    data: { phone: '+79991110001', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991110002', pin: 'h', name: 'Target' },
  });
  const survivor = await prisma.user.create({
    data: { phone: '+79991110003', pin: 'h', name: 'Survivor' },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, survivor, token };
}

describe('admin user soft-delete (ADMIN-12, Phase-4.5 04.5-05)', () => {
  it('Test 1+2 — DELETE /api/admin/users/:id (no mode) defaults to soft and writes USER_SOFT_DELETE audit', async () => {
    const { admin, target, token } = await seedAdminAndTargets();
    const res = await supertest(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(target.id);
    expect(res.body.deletedAt).toBeTruthy();

    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after.deletedAt).toBeInstanceOf(Date);

    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_SOFT_DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('User');
    expect(audits[0].targetId).toBe(target.id);
    expect(audits[0].payload.before.deletedAt).toBeNull();
    expect(audits[0].payload.after.deletedAt).toBeTruthy();
  });

  it('Test 2b — explicit ?mode=soft is identical to default', async () => {
    const { target, token } = await seedAdminAndTargets();
    const res = await supertest(app)
      .delete(`/api/admin/users/${target.id}?mode=soft`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_SOFT_DELETE' } });
    expect(audits).toHaveLength(1);
  });

  it('Test 3 — second soft-delete on already-deleted user returns 409 USER_ALREADY_DELETED', async () => {
    const { target, token } = await seedAdminAndTargets();
    await supertest(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    const res = await supertest(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USER_ALREADY_DELETED');
    // Only one audit row across both attempts.
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_SOFT_DELETE' } });
    expect(audits).toHaveLength(1);
  });

  it('Test 4 — GET /api/admin/users excludes soft-deleted users by default', async () => {
    const { target, survivor, token } = await seedAdminAndTargets();
    await supertest(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    const res = await supertest(app)
      .get('/api/admin/users?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((u) => u.id);
    expect(ids).not.toContain(target.id);
    expect(ids).toContain(survivor.id);
    // {items, total, page, limit} shape per UI-SPEC.
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(typeof res.body.total).toBe('number');
  });

  it('Test 5 — invalid ?mode value rejected with 400 VALIDATION_FAILED', async () => {
    const { target, token } = await seedAdminAndTargets();
    const res = await supertest(app)
      .delete(`/api/admin/users/${target.id}?mode=banana`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    // No audit row — pre-handler validator failure.
    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });

  it('Test 6 — DELETE on non-existent id returns 404 NOT_FOUND', async () => {
    const { token } = await seedAdminAndTargets();
    const res = await supertest(app)
      .delete('/api/admin/users/non-existent-id-cuid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('Test 7 — writeAudit throwing rolls back the soft-delete (deletedAt unchanged, no audit row)', async () => {
    const { target, token } = await seedAdminAndTargets();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => {
      throw new Error('simulated_audit_failure');
    };
    try {
      const res = await supertest(app)
        .delete(`/api/admin/users/${target.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after.deletedAt).toBeNull();
    const audits = await prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });

  it('Test 8 — PUT /:id on a soft-deleted user returns 404 NOT_FOUND', async () => {
    const { target, token } = await seedAdminAndTargets();
    await supertest(app)
      .delete(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    const res = await supertest(app)
      .put(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NewName' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
