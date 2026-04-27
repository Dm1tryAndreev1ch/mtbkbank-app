// backend/src/routes/admin/dashboard.js
//
// Phase 4.5 / 04.5-01 / D-01 — dashboard sub-module.
// Handlers migrated VERBATIM from the deleted singular routes/admin.js
// (only the require paths gained one `..` segment for the new depth).
//
// Auth chain mounted app-level in src/index.js — do NOT remount middleware here.
//
// Plan 4 (Ops cluster) extends this with the audit-log "last 50 entries" widget.

const { logger } = require('../../logger');

async function summary(req, res) {
  try {
    const [totalUsers, totalCards, totalTransactions, mbAgg, cards] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.userCard.count(),
      req.prisma.transaction.count(),
      req.prisma.user.aggregate({ _sum: { mbPoints: true } }),
      req.prisma.userCard.findMany({
        select: { collectionCard: { select: { rarity: true } } },
      }),
    ]);

    const rarityDistribution = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (const c of cards) {
      const rarity = c.collectionCard?.rarity;
      if (rarity && rarityDistribution[rarity] !== undefined) {
        rarityDistribution[rarity] += 1;
      }
    }

    res.json({
      totalUsers,
      totalCards,
      totalTransactions,
      totalMBInCirculation: mbAgg._sum.mbPoints || 0,
      rarityDistribution,
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin dashboard error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

async function extended(req, res) {
  try {
    const [balanceAgg, recentTransactions] = await Promise.all([
      req.prisma.bankAccount.aggregate({ _sum: { balance: true } }),
      req.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    res.json({
      totalBalance: balanceAgg._sum.balance || 0,
      recentTransactions,
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin extended dashboard error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// ---------------------------------------------------------------------------
// Phase 4.5 / 04.5-04 / D-09 Plan 4 / D-12 — audit-log "last 50 entries" widget.
//
// Read-only endpoint backing the DashboardPage audit widget (UI-SPEC
// §"Audit-Log Dashboard Widget"). LIMIT 50 ORDER BY createdAt DESC, with a
// projected actor join so the widget can render `actor.name` (or "(удалён)"
// when the actor row was nullified by Migration A's onDelete: SetNull).
//
// PII redaction is the WRITER's job — payload is returned verbatim because
// scrubObject already redacted forbidden keys (pin/password/cardNumber/...)
// at write time (Phase 3 D-03). T-04.5-04-05.
//
// Skips withAudit by design — read-only endpoints don't write audit rows.
// ---------------------------------------------------------------------------
async function audit(req, res, next) {
  try {
    const items = await req.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, name: true } } },
    });
    res.json({ items, total: items.length, page: 1, limit: 50 });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin dashboard audit error');
    next(err);
  }
}

module.exports = { summary, extended, audit };
