/**
 * Phase 4.5 / 04.5-06 / Task 1 — D-04 enforcement of ADMIN-04.
 *
 * Cross-cluster audit-rollback regression. For EVERY admin mutation route in
 * backend/src/routes/admin/*.js (enumerated at runtime via fs.readdirSync) we:
 *   (a) seed minimal valid fixtures,
 *   (b) snapshot the relevant DB rows,
 *   (c) monkey-patch auditLog.writeAudit to throw,
 *   (d) execute the route with a valid admin JWT + valid body,
 *   (e) assert response status >= 500,
 *   (f) restore writeAudit,
 *   (g) re-snapshot and assert NO row was written / deleted / mutated.
 *
 * Test 4 (no-mutation control): GET /api/admin/dashboard with writeAudit
 * throwing returns 200 — proves the harness discriminates between mutations
 * (rolled back) and reads (unaffected because no audit row).
 *
 * Adding a new admin mutation route in a future PR without withAudit causes
 * this test to FAIL on that route's parametrized case (the rollback expectation
 * fails when the mutation commits despite a thrown writeAudit). Adding a
 * mutation route without a fixture entry causes the fixture-coverage gate to
 * throw `Fixture missing for {VERB} /admin/{domain}{routePath}`.
 *
 * Harness mirrors backend/tests/integration/audit-log.test.js:75-94 — JWT mint
 * with isAdmin:true, truncateAll between tests, supertest against the live app.
 */

const fs = require('fs');
const path = require('path');
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

// ---------------------------------------------------------------------------
// Route enumeration. Reads every file under routes/admin/*.js and greps for
// `router.<verb>(<path>` lines. Filters to mutation verbs only.
//
// `domain` is the file basename minus `.js`; `mountPrefix` maps domain→URL
// segment (cardTemplates.js mounts at /cards per routes/admin/index.js).
// ---------------------------------------------------------------------------
const DOMAIN_TO_MOUNT = {
  accounts: '/accounts',
  bankCards: '/bankCards',
  cardTemplates: '/cards',
  decks: '/decks',
  limits: '/limits',
  notifications: '/notifications',
  payments: '/payments',
  quests: '/quests',
  subscriptions: '/subscriptions',
  trades: '/trades',
  transactions: '/transactions',
  userCards: '/userCards',
  users: '/users',
};

function enumerateAdminMutationRoutes() {
  const dir = path.join(__dirname, '..', '..', 'src', 'routes', 'admin');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'dashboard.js');
  const routes = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const re = /router\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    const domain = file.replace(/\.js$/, '');
    const mountPrefix = DOMAIN_TO_MOUNT[domain];
    if (!mountPrefix) {
      throw new Error(
        `Mount prefix missing for domain ${domain} — add to DOMAIN_TO_MOUNT in admin-audit-rollback.test.js`
      );
    }
    let m;
    while ((m = re.exec(src)) !== null) {
      routes.push({
        file,
        domain,
        mountPrefix,
        verb: m[1].toUpperCase(),
        routePath: m[2],
      });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Shared fixture seed. One admin + one target + one of every domain entity
// the parametrized tests need to point :id at. truncateAll() between tests
// keeps these isolated.
// ---------------------------------------------------------------------------
async function seedFixtures() {
  const admin = await prisma.user.create({
    data: {
      phone: '+79991234561',
      pin: 'h',
      name: 'Audit-Rollback Admin',
      isAdmin: true,
    },
  });
  const target = await prisma.user.create({
    data: { phone: '+79991234562', pin: 'h', name: 'Target' },
  });
  const peer = await prisma.user.create({
    data: { phone: '+79991234563', pin: 'h', name: 'Peer' },
  });

  const account = await prisma.bankAccount.create({
    data: {
      userId: target.id,
      name: 'Основной',
      type: 'main',
      balance: 1000,
    },
  });
  const peerAccount = await prisma.bankAccount.create({
    data: {
      userId: peer.id,
      name: 'Peer',
      type: 'main',
      balance: 1000,
    },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId: target.id,
      fromAccountId: account.id,
      amount: 100,
      currency: 'RUB',
      type: 'PURCHASE',
      status: 'completed',
      merchant: 'TEST',
    },
  });

  const payment = await prisma.transaction.create({
    data: {
      userId: target.id,
      fromAccountId: account.id,
      amount: 50,
      currency: 'RUB',
      type: 'PAYMENT',
      status: 'completed',
      merchant: 'PAYMENT',
    },
  });

  const bankCard = await prisma.bankCard.create({
    data: {
      userId: target.id,
      accountId: account.id,
      maskedNumber: '**** 1234',
      type: 'debit',
      tier: 'standard',
    },
  });

  // CollectionCard for UserCard FK.
  const collectionCard = await prisma.collectionCard.create({
    data: {
      name: 'Test Card',
      description: 'desc',
      rarity: 'COMMON',
      brandName: 'Brand',
      brandIcon: 'icon',
      brandLogo: 'logo',
      imageUrl: 'http://example.com/img.png',
      cashbackPercent: 1,
      maxHealth: 100,
      dropRate: 0.1,
      isActive: true,
    },
  });

  const collectionCard2 = await prisma.collectionCard.create({
    data: {
      name: 'Other Card',
      description: 'desc2',
      rarity: 'RARE',
      brandName: 'Brand2',
      brandIcon: 'icon2',
      brandLogo: 'logo2',
      imageUrl: 'http://example.com/img2.png',
      cashbackPercent: 2,
      maxHealth: 100,
      dropRate: 0.05,
      isActive: true,
    },
  });

  const userCard = await prisma.userCard.create({
    data: {
      userId: target.id,
      collectionCardId: collectionCard.id,
      health: 100,
    },
  });

  const deck = await prisma.deck.create({
    data: { userId: target.id, name: 'Active', isActive: true },
  });

  const quest = await prisma.quest.create({
    data: {
      title: 'Test Quest',
      description: 'desc',
      icon: 'icon',
      rewardMB: 10,
      type: 'DAILY',
      condition: 'condition',
      isActive: true,
    },
  });

  const userQuest = await prisma.userQuest.create({
    data: {
      userId: target.id,
      questId: quest.id,
      progress: 0,
      target: 1,
    },
  });

  const limit = await prisma.spendingLimit.create({
    data: {
      userId: target.id,
      category: 'food',
      limitAmount: 100,
      period: 'monthly',
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      userId: target.id,
      name: 'Sub',
      icon: 'subscriptions',
      amount: 9.99,
      nextPayment: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const trade = await prisma.cardTrade.create({
    data: {
      fromUserId: target.id,
      toUserId: peer.id,
      offeredCardId: collectionCard.id,
      requestedCardId: collectionCard2.id,
      status: 'PENDING',
    },
  });

  const token = jwt.sign(
    { userId: admin.id, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  return {
    admin,
    target,
    peer,
    account,
    peerAccount,
    tx,
    payment,
    bankCard,
    collectionCard,
    collectionCard2,
    userCard,
    deck,
    quest,
    userQuest,
    limit,
    subscription,
    trade,
    token,
  };
}

// ---------------------------------------------------------------------------
// Per-route fixture. Returns { url, body }. Default branch throws explicitly
// so a new route added without a fixture entry fails this test loudly
// (D-04 defence in depth — Fixture missing for ...).
// ---------------------------------------------------------------------------
function buildFixturesFor(route, ctx) {
  const key = `${route.verb} ${route.mountPrefix}${route.routePath}`;
  switch (key) {
    // -- accounts -----------------------------------------------------------
    case 'POST /accounts/:id/freeze':
      return { url: `/api/admin/accounts/${ctx.account.id}/freeze`, body: { reason: 'audit-rollback test' } };
    case 'POST /accounts/:id/unfreeze':
      return { url: `/api/admin/accounts/${ctx.account.id}/unfreeze`, body: { reason: 'audit-rollback test' } };
    case 'POST /accounts/:id/balance-adjust':
      return { url: `/api/admin/accounts/${ctx.account.id}/balance-adjust`, body: { delta: 100, reason: 'audit-rollback test' } };

    // -- bankCards ----------------------------------------------------------
    case 'POST /bankCards/':
      return { url: '/api/admin/bankCards', body: { userId: ctx.target.id, accountId: ctx.account.id, type: 'debit', tier: 'standard', maskedNumber: '**** 9999' } };
    case 'POST /bankCards/:id/block':
      return { url: `/api/admin/bankCards/${ctx.bankCard.id}/block`, body: { reason: 'audit-rollback test' } };
    case 'POST /bankCards/:id/unblock':
      return { url: `/api/admin/bankCards/${ctx.bankCard.id}/unblock`, body: { reason: 'audit-rollback test' } };
    case 'DELETE /bankCards/:id':
      return { url: `/api/admin/bankCards/${ctx.bankCard.id}`, body: {} };

    // -- cardTemplates (mounted at /cards) ---------------------------------
    case 'POST /cards/':
      return { url: '/api/admin/cards', body: { name: 'New', description: 'd', rarity: 'COMMON', brandName: 'B', brandIcon: 'i', brandLogo: 'l', imageUrl: 'http://x', cashbackPercent: 1, maxHealth: 100, dropRate: 0.1, isActive: true } };
    case 'PUT /cards/:id':
      return { url: `/api/admin/cards/${ctx.collectionCard.id}`, body: { name: 'Renamed' } };
    case 'DELETE /cards/:id':
      return { url: `/api/admin/cards/${ctx.collectionCard2.id}`, body: {} };

    // -- decks --------------------------------------------------------------
    case 'POST /decks/:id/break-active':
      return { url: `/api/admin/decks/${ctx.deck.id}/break-active`, body: { reason: 'audit-rollback test' } };

    // -- limits -------------------------------------------------------------
    case 'POST /limits/':
      return { url: '/api/admin/limits', body: { userId: ctx.target.id, category: 'fuel', amount: 5000, period: 'MONTHLY' } };
    case 'PUT /limits/:id':
      return { url: `/api/admin/limits/${ctx.limit.id}`, body: { amount: 200 } };
    case 'DELETE /limits/:id':
      return { url: `/api/admin/limits/${ctx.limit.id}`, body: {} };

    // -- notifications ------------------------------------------------------
    case 'POST /notifications/broadcast':
      return { url: '/api/admin/notifications/broadcast', body: { audience: { type: 'USER', userId: ctx.target.id }, title: 'Hi', body: 'Body' } };

    // -- payments -----------------------------------------------------------
    case 'POST /payments/:id/status':
      return { url: `/api/admin/payments/${ctx.payment.id}/status`, body: { status: 'pending', reason: 'audit-rollback test' } };

    // -- quests -------------------------------------------------------------
    case 'POST /quests/':
      return { url: '/api/admin/quests', body: { title: 'Q', description: 'D', icon: 'i', rewardMB: 10, type: 'DAILY', condition: 'c' } };
    case 'PUT /quests/:id':
      return { url: `/api/admin/quests/${ctx.quest.id}`, body: { title: 'Renamed' } };
    case 'POST /quests/:id/deactivate':
      return { url: `/api/admin/quests/${ctx.quest.id}/deactivate`, body: {} };
    case 'DELETE /quests/:id':
      return { url: `/api/admin/quests/${ctx.quest.id}`, body: {} };
    case 'POST /quests/user-quest/:id/reset':
      return { url: `/api/admin/quests/user-quest/${ctx.userQuest.id}/reset`, body: { reason: 'audit-rollback test' } };

    // -- subscriptions ------------------------------------------------------
    case 'POST /subscriptions/':
      return { url: '/api/admin/subscriptions', body: { userId: ctx.target.id, name: 'New', amount: 5.5 } };
    case 'PUT /subscriptions/:id':
      return { url: `/api/admin/subscriptions/${ctx.subscription.id}`, body: { name: 'Renamed' } };
    case 'DELETE /subscriptions/:id':
      return { url: `/api/admin/subscriptions/${ctx.subscription.id}`, body: {} };

    // -- trades -------------------------------------------------------------
    case 'POST /trades/:id/cancel':
      return { url: `/api/admin/trades/${ctx.trade.id}/cancel`, body: { reason: 'audit-rollback test' } };

    // -- transactions -------------------------------------------------------
    case 'POST /transactions/:id/reverse':
      return { url: `/api/admin/transactions/${ctx.tx.id}/reverse`, body: { reason: 'audit-rollback test' } };
    case 'POST /transactions/simulate':
      return { url: '/api/admin/transactions/simulate', body: { userId: ctx.target.id, accountId: ctx.account.id, amount: 10, category: 'food', merchant: 'M', type: 'TOPUP' } };

    // -- userCards ----------------------------------------------------------
    case 'POST /userCards/grant':
      return { url: '/api/admin/userCards/grant', body: { userId: ctx.peer.id, collectionCardId: ctx.collectionCard.id } };
    case 'DELETE /userCards/:id':
      return { url: `/api/admin/userCards/${ctx.userCard.id}`, body: {} };
    case 'PUT /userCards/:id/health':
      return { url: `/api/admin/userCards/${ctx.userCard.id}/health`, body: { health: 50 } };

    // -- users --------------------------------------------------------------
    case 'PUT /users/:id':
      return { url: `/api/admin/users/${ctx.target.id}`, body: { name: 'Changed' } };
    case 'POST /users/':
      return { url: '/api/admin/users', body: { name: 'Brand New', phone: '+79991234599', pin: '1234' } };
    case 'DELETE /users/:id':
      return { url: `/api/admin/users/${ctx.target.id}?mode=hard`, body: {} };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot helper. Compares before/after to pin "no row written/deleted/
// mutated". Returns a small object the test compares with toEqual.
// ---------------------------------------------------------------------------
async function snapshotForRoute(route, ctx) {
  const auditCount = await prisma.auditLog.count();
  switch (route.domain) {
    case 'accounts':
      return {
        auditCount,
        account: await prisma.bankAccount.findUnique({ where: { id: ctx.account.id } }),
      };
    case 'transactions':
      return {
        auditCount,
        tx: await prisma.transaction.findUnique({ where: { id: ctx.tx.id } }),
        accountBalance: (await prisma.bankAccount.findUnique({ where: { id: ctx.account.id } }))?.balance,
        txCount: await prisma.transaction.count(),
      };
    case 'bankCards':
      return {
        auditCount,
        card: await prisma.bankCard.findUnique({ where: { id: ctx.bankCard.id } }),
        cardCount: await prisma.bankCard.count(),
      };
    case 'cardTemplates':
      return {
        auditCount,
        cc1: await prisma.collectionCard.findUnique({ where: { id: ctx.collectionCard.id } }),
        cc2: await prisma.collectionCard.findUnique({ where: { id: ctx.collectionCard2.id } }),
        ccCount: await prisma.collectionCard.count(),
      };
    case 'userCards':
      return {
        auditCount,
        userCard: await prisma.userCard.findUnique({ where: { id: ctx.userCard.id } }),
        userCardCount: await prisma.userCard.count(),
      };
    case 'decks':
      return {
        auditCount,
        deck: await prisma.deck.findUnique({ where: { id: ctx.deck.id } }),
      };
    case 'quests':
      return {
        auditCount,
        quest: await prisma.quest.findUnique({ where: { id: ctx.quest.id } }),
        userQuest: await prisma.userQuest.findUnique({ where: { id: ctx.userQuest.id } }),
        questCount: await prisma.quest.count(),
      };
    case 'limits':
      return {
        auditCount,
        limit: await prisma.spendingLimit.findUnique({ where: { id: ctx.limit.id } }),
        limitCount: await prisma.spendingLimit.count(),
      };
    case 'payments':
      return {
        auditCount,
        payment: await prisma.transaction.findUnique({ where: { id: ctx.payment.id } }),
      };
    case 'subscriptions':
      return {
        auditCount,
        subscription: await prisma.subscription.findUnique({ where: { id: ctx.subscription.id } }),
        subscriptionCount: await prisma.subscription.count(),
      };
    case 'notifications':
      return {
        auditCount,
        notificationCount: await prisma.notification.count(),
      };
    case 'trades':
      return {
        auditCount,
        trade: await prisma.cardTrade.findUnique({ where: { id: ctx.trade.id } }),
      };
    case 'users':
      return {
        auditCount,
        target: await prisma.user.findUnique({ where: { id: ctx.target.id } }),
        userCount: await prisma.user.count(),
      };
    default:
      throw new Error(`Snapshot missing for domain ${route.domain}`);
  }
}

// ===========================================================================
// Tests
// ===========================================================================
const ROUTES = enumerateAdminMutationRoutes();

describe('Phase-4.5 D-04: every admin mutation rolls back when writeAudit throws', () => {
  it('Test 0 — enumerator finds >= 20 admin mutation routes', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(20);
  });

  test.each(ROUTES.map((r) => [`${r.verb} ${r.mountPrefix}${r.routePath}`, r]))(
    'rolls back: %s',
    async (_label, route) => {
      const ctx = await seedFixtures();
      const fx = buildFixturesFor(route, ctx);
      if (!fx) {
        throw new Error(
          `Fixture missing for ${route.verb} ${route.mountPrefix}${route.routePath} — add to buildFixturesFor in admin-audit-rollback.test.js`
        );
      }

      const before = await snapshotForRoute(route, ctx);

      const original = auditLog.writeAudit;
      auditLog.writeAudit = async () => {
        throw new Error('simulated_audit_failure');
      };
      let res;
      try {
        const verb = route.verb.toLowerCase();
        res = await supertest(app)
          [verb](fx.url)
          .set('Authorization', `Bearer ${ctx.token}`)
          .send(fx.body);
      } finally {
        auditLog.writeAudit = original;
      }

      // The tx wrap surfaces the thrown writeAudit as a 5xx. Some routes have
      // their own catch ladder that translates Prisma errors first; either way
      // a thrown writeAudit must not produce a 2xx.
      expect(res.status).toBeGreaterThanOrEqual(500);

      const after = await snapshotForRoute(route, ctx);
      expect(after).toEqual(before);
    },
    30000 // per-test timeout — DB seed is hefty
  );

  it('Test 4 — read-only control: GET /api/admin/dashboard returns 200 even when writeAudit throws', async () => {
    const ctx = await seedFixtures();
    const original = auditLog.writeAudit;
    auditLog.writeAudit = async () => {
      throw new Error('simulated_audit_failure');
    };
    let res;
    try {
      res = await supertest(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${ctx.token}`);
    } finally {
      auditLog.writeAudit = original;
    }
    expect(res.status).toBe(200);
  });

  it('Test 5 — writeAudit reference restored after suite (cleanup contract)', () => {
    expect(typeof auditLog.writeAudit).toBe('function');
    // The throwing stub closure had `simulated_audit_failure` baked in; the
    // restored reference is the genuine writeAudit which throws different
    // validation errors when called with a non-tx first arg. We assert the
    // function source does NOT contain the throwing-stub sentinel.
    expect(String(auditLog.writeAudit)).not.toContain('simulated_audit_failure');
  });
});
