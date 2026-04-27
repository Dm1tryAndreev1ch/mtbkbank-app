/**
 * Phase 4.5 / 04.5-05 / ADMIN-12 — D-07 cascade contract test.
 *
 * Mirrors Roadmap Phase 4.5 Success Criterion 3 verbatim:
 *   - DELETE /api/admin/users/:id?mode=hard removes the user.
 *   - Owned data (BankAccount, BankCard, UserCard, Deck, Transaction,
 *     Notification, UserQuest, Subscription, SpendingLimit) cascade-deleted
 *     atomically via Plan-1 Migration A schema FKs.
 *   - User.refreshToken column data vanishes WITH the row (it's a column,
 *     not a separate model).
 *   - CardTrade rows where deleted user was peer SURVIVE with their FK
 *     (fromUserId or toUserId) nullified per onDelete:SetNull. Peer-side
 *     data on the trade row stays intact.
 *   - AuditLog row for THIS USER_HARD_DELETE write preserved (actor = the
 *     deleting admin, not the target).
 *   - Historical AuditLog rows where actorId == targetId survive with
 *     actorId set to NULL (AuditLog.actor onDelete:SetNull, Plan-1 Migration A).
 *   - Self-delete forbidden (admin cannot delete their own account).
 *   - writeAudit-rollback: tx fails → user + owned data preserved, no audit row.
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

async function seedRichUserAndPeer() {
  const admin = await prisma.user.create({
    data: { phone: '+79992220001', pin: 'h', name: 'Admin', isAdmin: true },
  });
  const target = await prisma.user.create({
    data: {
      phone: '+79992220002',
      pin: 'h',
      name: 'Target',
      refreshToken: 'rt-target',
      refreshTokenExpiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const peer = await prisma.user.create({
    data: { phone: '+79992220003', pin: 'h', name: 'Peer' },
  });
  // Two BankAccounts for target.
  const accA = await prisma.bankAccount.create({
    data: { userId: target.id, name: 'Основной', type: 'main', balance: 1000 },
  });
  const accB = await prisma.bankAccount.create({
    data: { userId: target.id, name: 'Сберегательный', type: 'savings', balance: 500 },
  });
  // BankAccount for peer (should survive).
  const peerAcc = await prisma.bankAccount.create({
    data: { userId: peer.id, name: 'Peer Main', type: 'main', balance: 200 },
  });
  // 2 BankCards for target, 1 for peer.
  await prisma.bankCard.create({
    data: { userId: target.id, accountId: accA.id, maskedNumber: '**** 0001', type: 'debit', tier: 'standard' },
  });
  await prisma.bankCard.create({
    data: { userId: target.id, accountId: accB.id, maskedNumber: '**** 0002', type: 'debit', tier: 'gold' },
  });
  await prisma.bankCard.create({
    data: { userId: peer.id, accountId: peerAcc.id, maskedNumber: '**** 0003', type: 'debit', tier: 'standard' },
  });
  // 3 Transactions for target.
  await prisma.transaction.createMany({
    data: [
      { userId: target.id, fromAccountId: accA.id, amount: 100, type: 'TRANSFER_OUT', status: 'completed' },
      { userId: target.id, toAccountId: accB.id,   amount: 200, type: 'TOPUP',        status: 'completed' },
      { userId: target.id, fromAccountId: accA.id, amount: 50,  type: 'PAYMENT',      status: 'completed' },
    ],
  });
  // 1 Transaction for peer (should survive).
  await prisma.transaction.create({
    data: { userId: peer.id, fromAccountId: peerAcc.id, amount: 75, type: 'PAYMENT', status: 'completed' },
  });
  // Collection card template + UserCards / Deck / DeckCards for target.
  const cc = await prisma.collectionCard.create({
    data: {
      name: 'Test Card', brandName: 'Brand', brandIcon: 'star',
      rarity: 'COMMON', cashbackPercent: 1.0, mbValue: 10, maxHealth: 100,
      isActive: true,
    },
  });
  // UserCard is unique on (userId, collectionCardId) so we need 2 templates
  // for the target if we want 2 owned UserCards.
  const cc2 = await prisma.collectionCard.create({
    data: {
      name: 'Test Card 2', brandName: 'Brand2', brandIcon: 'star',
      rarity: 'COMMON', cashbackPercent: 1.0, mbValue: 10, maxHealth: 100,
      isActive: true,
    },
  });
  const uc1 = await prisma.userCard.create({
    data: { userId: target.id, collectionCardId: cc.id, health: 80 },
  });
  const uc2 = await prisma.userCard.create({
    data: { userId: target.id, collectionCardId: cc2.id, health: 60 },
  });
  // Peer also owns a UserCard (must survive).
  const peerUc = await prisma.userCard.create({
    data: { userId: peer.id, collectionCardId: cc.id, health: 90 },
  });
  await prisma.deck.create({
    data: {
      userId: target.id,
      name: 'Active Deck',
      isActive: true,
      deckCards: { create: [{ userCardId: uc1.id, slotIndex: 0 }, { userCardId: uc2.id, slotIndex: 1 }] },
    },
  });
  // 2 CardTrade rows: outbound (target→peer) and inbound (peer→target).
  // Schema requires offeredCardId (= a UserCard.id), no fromUserCardId column.
  const tradeOut = await prisma.cardTrade.create({
    data: {
      fromUserId: target.id,
      toUserId: peer.id,
      offeredCardId: uc1.id,
      status: 'PENDING',
    },
  });
  const tradeIn = await prisma.cardTrade.create({
    data: {
      fromUserId: peer.id,
      toUserId: target.id,
      offeredCardId: peerUc.id,
      status: 'PENDING',
    },
  });
  // Notification + UserQuest + Subscription + SpendingLimit for target (cascade Cascade).
  await prisma.notification.create({
    data: { userId: target.id, title: 'T', body: 'm' },
  });
  // Need a Quest for UserQuest fk.
  const quest = await prisma.quest.create({
    data: {
      title: 'Q', description: 'D', icon: 'star', rewardMB: 0,
      type: 'DAILY', condition: '{}', isActive: true,
    },
  });
  await prisma.userQuest.create({
    data: { userId: target.id, questId: quest.id, progress: 0 },
  });
  await prisma.subscription.create({
    data: {
      userId: target.id,
      name: 'S', amount: 9.99, icon: 'subscriptions',
      nextPayment: new Date(Date.now() + 30 * 86400_000),
    },
  });
  await prisma.spendingLimit.create({
    data: { userId: target.id, category: 'food', limitAmount: 5000, period: 'monthly' },
  });

  // Pre-existing AuditLog row where actorId === target.id — must survive
  // with actorId=null after hard-delete (Plan-1 AuditLog.actor SetNull).
  await prisma.auditLog.create({
    data: {
      actorId: target.id,
      action: 'PRIOR_TARGET_ACTION',
      targetType: 'User',
      targetId: target.id,
      payload: { note: 'historical' },
    },
  });

  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  return { admin, target, peer, peerAcc, peerUc, tradeOut, tradeIn, quest, token };
}

describe('admin user hard-delete cascade (ADMIN-12 / D-07, Phase-4.5 04.5-05)', () => {
  it('Test 1 — full cascade: owned-data gone, peer data preserved, CardTrade peer FK nullified, AuditLog actor tombstone preserved', async () => {
    const { admin, target, peer, peerAcc, peerUc, tradeOut, tradeIn, token } = await seedRichUserAndPeer();

    // Sanity — pre-delete owned counts > 0.
    expect(await prisma.bankAccount.count({ where: { userId: target.id } })).toBe(2);
    expect(await prisma.bankCard.count({ where: { userId: target.id } })).toBe(2);
    expect(await prisma.userCard.count({ where: { userId: target.id } })).toBe(2);
    expect(await prisma.deck.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: target.id } })).toBe(3);
    expect(await prisma.notification.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.userQuest.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.subscription.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.spendingLimit.count({ where: { userId: target.id } })).toBe(1);

    const res = await supertest(app)
      .delete(`/api/admin/users/${target.id}?mode=hard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // (b) target gone.
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();

    // (c-i) all owned tables drained for target.
    expect(await prisma.bankAccount.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.bankCard.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.userCard.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.deck.count({ where: { userId: target.id } })).toBe(0);
    // DeckCards cascade through Deck (Cascade on deckId).
    expect(await prisma.deckCard.count()).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.userQuest.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.subscription.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.spendingLimit.count({ where: { userId: target.id } })).toBe(0);

    // (j) peer survived with their owned data.
    const peerAfter = await prisma.user.findUnique({ where: { id: peer.id } });
    expect(peerAfter).not.toBeNull();
    expect(await prisma.bankAccount.count({ where: { id: peerAcc.id } })).toBe(1);
    expect(await prisma.userCard.count({ where: { id: peerUc.id } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: peer.id } })).toBe(1);
    expect(await prisma.bankCard.count({ where: { userId: peer.id } })).toBe(1);

    // (k) CardTrade peer rows survive — the side referencing the deleted user
    // is now NULL; the OTHER side still references peer.
    const tOut = await prisma.cardTrade.findUnique({ where: { id: tradeOut.id } });
    expect(tOut).not.toBeNull();
    expect(tOut.fromUserId).toBeNull();   // target side nullified
    expect(tOut.toUserId).toBe(peer.id);  // peer survives
    const tIn = await prisma.cardTrade.findUnique({ where: { id: tradeIn.id } });
    expect(tIn).not.toBeNull();
    expect(tIn.fromUserId).toBe(peer.id); // peer survives
    expect(tIn.toUserId).toBeNull();      // target side nullified

    // (l) AuditLog row for THIS hard-delete — actor = admin, target = the deleted user id.
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_HARD_DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].targetType).toBe('User');
    expect(audits[0].targetId).toBe(target.id);
    expect(audits[0].payload.before).toMatchObject({ name: 'Target', phone: '+79992220002' });
    // writeAudit serializes `after` only when truthy (after = null becomes
    // `undefined` in payload via `after ? scrubObject(after) : undefined`).
    expect(audits[0].payload.after == null).toBe(true);

    // (m) historical AuditLog row where actorId === target.id survives with actorId NULL.
    const tombstones = await prisma.auditLog.findMany({ where: { action: 'PRIOR_TARGET_ACTION' } });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].actorId).toBeNull();
  });

  it('Test 2 — self-delete forbidden: admin trying to hard-delete themselves returns 409 USER_SELF_DELETE_FORBIDDEN; admin row + no audit', async () => {
    const { admin, token } = await seedRichUserAndPeer();
    const res = await supertest(app)
      .delete(`/api/admin/users/${admin.id}?mode=hard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USER_SELF_DELETE_FORBIDDEN');
    const after = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(after).not.toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_HARD_DELETE' } });
    expect(audits).toHaveLength(0);
  });

  it('Test 3 — writeAudit-rollback: tx rolls back, target + owned data preserved, no audit row', async () => {
    const { target, token } = await seedRichUserAndPeer();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => {
      throw new Error('simulated_audit_failure');
    };
    try {
      const res = await supertest(app)
        .delete(`/api/admin/users/${target.id}?mode=hard`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      auditLog.writeAudit = original;
    }
    // Target + all owned data preserved.
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after).not.toBeNull();
    expect(await prisma.bankAccount.count({ where: { userId: target.id } })).toBe(2);
    expect(await prisma.transaction.count({ where: { userId: target.id } })).toBe(3);
    expect(await prisma.userCard.count({ where: { userId: target.id } })).toBe(2);
    expect(await prisma.deck.count({ where: { userId: target.id } })).toBe(1);
    // No USER_HARD_DELETE audit row.
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_HARD_DELETE' } });
    expect(audits).toHaveLength(0);
  });

  it('Test 4 — DELETE ?mode=hard on non-existent user returns 404 NOT_FOUND with no audit row', async () => {
    const { token } = await seedRichUserAndPeer();
    const res = await supertest(app)
      .delete('/api/admin/users/non-existent-cuid?mode=hard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    const audits = await prisma.auditLog.findMany({ where: { action: 'USER_HARD_DELETE' } });
    expect(audits).toHaveLength(0);
  });
});
