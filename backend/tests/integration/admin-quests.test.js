/**
 * Phase 4.5 / 04.5-03 / ADMIN-06 — admin Quest endpoints integration test.
 *
 * Covers full CRUD with SOFT delete (T-04.5-03-02 cascade landmine):
 *   GET    /api/admin/quests
 *   POST   /api/admin/quests
 *   PUT    /api/admin/quests/:id
 *   POST   /api/admin/quests/:id/deactivate
 *   DELETE /api/admin/quests/:id                    SOFT (isActive=false)
 *   POST   /api/admin/quests/user-quest/:id/reset
 *   rollback test on update.
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

afterAll(async () => { if (prisma) await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(); });

async function seedAdmin() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, token };
}

const validQuestBody = () => ({
  title: 'Test Quest',
  description: 'Do a test',
  icon: 'flag',
  rewardMB: 50,
  type: 'DAILY',
  condition: '{"kind":"PURCHASE","count":1}',
});

describe('admin quests (ADMIN-06, Phase-4.5 04.5-03)', () => {
  it('GET /api/admin/quests returns paged shape', async () => {
    const { token } = await seedAdmin();
    const res = await supertest(app)
      .get('/api/admin/quests?page=1&limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 50);
  });

  it('POST / creates a Quest with QUEST_CREATE audit', async () => {
    const { token, admin } = await seedAdmin();
    const res = await supertest(app)
      .post('/api/admin/quests')
      .set('Authorization', `Bearer ${token}`)
      .send(validQuestBody());
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Test Quest');
    const audits = await prisma.auditLog.findMany({ where: { action: 'QUEST_CREATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
  });

  it('PUT /:id updates a Quest with QUEST_UPDATE audit', async () => {
    const { token } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const res = await supertest(app)
      .put(`/api/admin/quests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', rewardMB: 100 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.rewardMB).toBe(100);
    const audits = await prisma.auditLog.findMany({ where: { action: 'QUEST_UPDATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.title).toBe('Test Quest');
    expect(audits[0].payload.after.title).toBe('Updated Title');
  });

  it('POST /:id/deactivate sets isActive=false with QUEST_DEACTIVATE audit', async () => {
    const { token } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const res = await supertest(app)
      .post(`/api/admin/quests/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { action: 'QUEST_DEACTIVATE' } });
    expect(audits).toHaveLength(1);
  });

  it('DELETE /:id is a SOFT delete (isActive=false, row preserved) — T-04.5-03-02', async () => {
    const { token } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const res = await supertest(app)
      .delete(`/api/admin/quests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Row still in DB (NOT a hard delete) so existing UserQuest references stay valid.
    const after = await prisma.quest.findUnique({ where: { id: created.body.id } });
    expect(after).not.toBeNull();
    expect(after.isActive).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { action: 'QUEST_DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.after.intent).toBe('delete');
  });

  it('SOFT delete preserves UserQuest rows pointing to the Quest', async () => {
    const { token, target } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const uq = await prisma.userQuest.create({
      data: {
        userId: target.id,
        questId: created.body.id,
        progress: 1,
        target: 5,
        completed: false,
      },
    });
    await supertest(app)
      .delete(`/api/admin/quests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    const uqAfter = await prisma.userQuest.findUnique({ where: { id: uq.id } });
    expect(uqAfter).not.toBeNull();
    expect(uqAfter.questId).toBe(created.body.id);
  });

  it('POST /user-quest/:id/reset clears progress + completedAt + USERQUEST_RESET audit', async () => {
    const { token, target } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const uq = await prisma.userQuest.create({
      data: {
        userId: target.id,
        questId: created.body.id,
        progress: 4,
        target: 5,
        completed: true,
        completedAt: new Date(),
      },
    });
    const res = await supertest(app)
      .post(`/api/admin/quests/user-quest/${uq.id}/reset`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe(0);
    expect(res.body.completed).toBe(false);
    expect(res.body.completedAt).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: 'USERQUEST_RESET' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.before.progress).toBe(4);
    expect(audits[0].payload.after.progress).toBe(0);
  });

  it('writeAudit throwing rolls back update', async () => {
    const { token } = await seedAdmin();
    const created = await supertest(app)
      .post('/api/admin/quests').set('Authorization', `Bearer ${token}`).send(validQuestBody());
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    try {
      const res = await supertest(app)
        .put(`/api/admin/quests/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Should rollback' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const after = await prisma.quest.findUnique({ where: { id: created.body.id } });
    expect(after.title).toBe('Test Quest');
  });
});
