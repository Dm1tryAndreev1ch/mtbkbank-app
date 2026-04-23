const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/quests/daily
router.get('/daily', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active quests
    const quests = await req.prisma.quest.findMany({
      where: { isActive: true, type: 'DAILY' },
    });

    // Get user progress for today
    const userQuests = await req.prisma.userQuest.findMany({
      where: {
        userId: req.userId,
        assignedAt: { gte: today },
      },
      include: { quest: true },
    });

    // Assign quests if not yet assigned today
    if (userQuests.length === 0 && quests.length > 0) {
      const toAssign = quests.slice(0, 3); // max 3 daily quests
      const created = await Promise.all(
        toAssign.map(q =>
          req.prisma.userQuest.create({
            data: {
              userId: req.userId,
              questId: q.id,
              target: 1,
            },
            include: { quest: true },
          })
        )
      );
      return res.json(created);
    }

    res.json(userQuests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/quests/weekly
router.get('/weekly', async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const userQuests = await req.prisma.userQuest.findMany({
      where: {
        userId: req.userId,
        quest: { type: 'WEEKLY' },
        assignedAt: { gte: weekStart },
      },
      include: { quest: true },
    });

    res.json(userQuests);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/quests/:id/claim
// FIX: claim flag and MB reward are now in a single $transaction to prevent
//      a server crash between the two steps from losing the user's reward.
router.post('/:id/claim', async (req, res) => {
  try {
    let rewardMB = 0;

    await req.prisma.$transaction(async (tx) => {
      // Atomically mark as claimed only if completed and not yet claimed
      const { count } = await tx.userQuest.updateMany({
        where: {
          id: req.params.id,
          userId: req.userId,
          completed: true,
          claimed: false,
        },
        data: { claimed: true },
      });

      if (count === 0) {
        throw new Error('NOT_FOUND');
      }

      // Fetch quest details inside the same transaction
      const userQuest = await tx.userQuest.findFirst({
        where: { id: req.params.id },
        include: { quest: true },
      });

      rewardMB = userQuest.quest.rewardMB ?? 0;

      // Award MB points atomically with the claim
      if (rewardMB > 0) {
        await tx.user.update({
          where: { id: req.userId },
          data: { mbPoints: { increment: rewardMB } },
        });
      }
    });

    res.json({ success: true, reward: { mb: rewardMB } });
  } catch (err) {
    if (err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Квест не найден или уже собран!' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
