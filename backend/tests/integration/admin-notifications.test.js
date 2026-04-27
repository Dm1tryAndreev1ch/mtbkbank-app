/**
 * Phase 4.5 / 04.5-04 / ADMIN-10 — admin notification broadcast integration test.
 *
 * Backend behaviors covered:
 *   1. USER audience — exactly 1 Notification row + 1 AuditLog row with audience.type=USER.
 *   2. SEGMENT audience GOLD — one Notification row per ACTIVE GOLD user; soft-deleted
 *      and non-GOLD users excluded.
 *   3. SEGMENT segment !== 'GOLD' — VALIDATION_FAILED 400.
 *   4. USER unknown id — 404 NOTIFICATION_NO_RECIPIENTS, no row written.
 *   5. Empty title / body — 400 VALIDATION_FAILED.
 *   6. body length > 500 — 400 VALIDATION_FAILED.
 *   7. writeAudit throw — entire tx rolls back, no Notification rows.
 *   8. Response shape { recipientCount, ok, error }.
 */

const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const { truncateAll, getPrisma } = require('../setup');

// Mock the push module BEFORE requiring app/index so the broadcast helper
// returns deterministic ok/error counts and never hits Expo.
jest.mock('../../src/push', () => ({
  __esModule: false,
  sendPushNotification: jest.fn(async () => undefined),
  sendCardDeathWarningPush: jest.fn(async () => undefined),
  sendBroadcast: jest.fn(async (recipients) => ({ ok: recipients.length, error: 0 })),
}));

let app;
let prisma;
let auditLog;
let pushModule;

beforeAll(() => {
  jest.resetModules();
  // Re-mock after resetModules so the route file picks up the mocked module.
  jest.doMock('../../src/push', () => ({
    sendPushNotification: jest.fn(async () => undefined),
    sendCardDeathWarningPush: jest.fn(async () => undefined),
    sendBroadcast: jest.fn(async (recipients) => ({ ok: recipients.length, error: 0 })),
  }));
  app = require('../../src/index');
  auditLog = require('../../src/services/auditLog');
  pushModule = require('../../src/push');
  prisma = getPrisma();
});

afterAll(async () => { if (prisma) await prisma.$disconnect(); });
beforeEach(async () => {
  await truncateAll();
  if (pushModule.sendBroadcast.mockClear) pushModule.sendBroadcast.mockClear();
});

async function seedAdminAndUsers() {
  const admin = await prisma.user.create({
    data: { phone: '+79991234561', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target', expoPushToken: 'ExponentPushToken[xxx-target]' },
  });
  const gold1 = await prisma.user.create({
    data: { phone: '+79991234563', pin: 'h', name: 'Gold1', status: 'GOLD' },
  });
  const gold2 = await prisma.user.create({
    data: { phone: '+79991234564', pin: 'h', name: 'Gold2', status: 'GOLD' },
  });
  const gold3 = await prisma.user.create({
    data: { phone: '+79991234565', pin: 'h', name: 'Gold3', status: 'GOLD' },
  });
  const blocked = await prisma.user.create({
    data: { phone: '+79991234566', pin: 'h', name: 'Blocked', status: 'BLOCKED' },
  });
  const goldDeleted = await prisma.user.create({
    data: {
      phone: '+79991234567', pin: 'h', name: 'GoldDeleted',
      status: 'GOLD', deletedAt: new Date(),
    },
  });
  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET, { expiresIn: '15m' }
  );
  return { admin, target, gold1, gold2, gold3, blocked, goldDeleted, token };
}

describe('admin notifications broadcast (ADMIN-10)', () => {
  it('USER audience creates exactly 1 Notification row + 1 AuditLog row', async () => {
    const { admin, target, token } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'USER', userId: target.id },
        title: 'Привет',
        body: 'Тестовое уведомление для одного пользователя',
      });
    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(1);
    expect(typeof res.body.ok).toBe('number');
    expect(typeof res.body.error).toBe('number');

    const notifs = await prisma.notification.findMany({ where: { userId: target.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toBe('Привет');

    const audits = await prisma.auditLog.findMany({ where: { action: 'NOTIFICATION_BROADCAST' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('Notification');
    expect(audits[0].payload.after.audience.type).toBe('USER');
    expect(audits[0].payload.after.recipientCount).toBe(1);
  });

  it('SEGMENT audience GOLD creates one Notification per active GOLD user; soft-deleted and non-GOLD excluded', async () => {
    const { token, gold1, gold2, gold3, blocked, goldDeleted } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'SEGMENT', segment: 'GOLD' },
        title: 'GOLD newsletter',
        body: 'Только для GOLD пользователей',
      });
    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(3);

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(3);
    const recipientIds = notifs.map((n) => n.userId).sort();
    expect(recipientIds).toEqual([gold1.id, gold2.id, gold3.id].sort());

    // Blocked + soft-deleted GOLD excluded.
    const blockedNotifs = await prisma.notification.findMany({ where: { userId: blocked.id } });
    expect(blockedNotifs).toHaveLength(0);
    const deletedGoldNotifs = await prisma.notification.findMany({ where: { userId: goldDeleted.id } });
    expect(deletedGoldNotifs).toHaveLength(0);

    const audits = await prisma.auditLog.findMany({ where: { action: 'NOTIFICATION_BROADCAST' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload.after.recipientCount).toBe(3);
  });

  it('SEGMENT segment != GOLD fails Zod validation', async () => {
    const { token } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'SEGMENT', segment: 'SILVER' },
        title: 'X', body: 'Y',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('USER unknown id returns 404 NOTIFICATION_NO_RECIPIENTS and writes nothing', async () => {
    const { token } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'USER', userId: 'nonexistent-id' },
        title: 'X', body: 'Y',
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOTIFICATION_NO_RECIPIENTS');

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { action: 'NOTIFICATION_BROADCAST' } });
    expect(audits).toHaveLength(0);
  });

  it('empty title or body fails validation', async () => {
    const { token, target } = await seedAdminAndUsers();
    const res1 = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ audience: { type: 'USER', userId: target.id }, title: '', body: 'Y' });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe('VALIDATION_FAILED');

    const res2 = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ audience: { type: 'USER', userId: target.id }, title: 'X', body: '' });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('VALIDATION_FAILED');
  });

  it('body length > 500 fails validation', async () => {
    const { token, target } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'USER', userId: target.id },
        title: 'X',
        body: 'x'.repeat(501),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('writeAudit throw rolls back: no Notification rows written, push not invoked', async () => {
    const { token, target } = await seedAdminAndUsers();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => { throw new Error('simulated_audit_failure'); };
    pushModule.sendBroadcast.mockClear();
    try {
      const res = await supertest(app)
        .post('/api/admin/notifications/broadcast')
        .set('Authorization', `Bearer ${token}`)
        .send({
          audience: { type: 'USER', userId: target.id },
          title: 'X', body: 'Y',
        });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
    // Push fan-out must NOT have run (it lives post-commit; tx threw).
    expect(pushModule.sendBroadcast).not.toHaveBeenCalled();
  });

  it('response shape { recipientCount, ok, error } returned on success', async () => {
    const { token, target } = await seedAdminAndUsers();
    const res = await supertest(app)
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        audience: { type: 'USER', userId: target.id },
        title: 'X', body: 'Y',
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('recipientCount');
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('error');
  });
});
