// Phase 4.5 / 04.5-01 — Admin dashboard handlers (migrated from routes/admin.js).
// Read-only summary + extended stats; no audit-log writes.
//
// Plan 4 will extend this with the audit-log "last 50 entries" widget.

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

module.exports = { summary, extended };
