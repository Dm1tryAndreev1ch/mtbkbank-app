// Phase 4.5 / 04.5-01 / D-01 — Admin users sub-router.
//
// Migrated VERBATIM from the singular routes/admin.js (users CRUD block).
// The PUT /:id mutation now uses auditLog.withAudit (D-03) instead of an
// inline prisma.$transaction + writeAudit pair.
//
// Plan 5 will extend this with soft/hard delete (cascade) using
// adminUserHardDeleteSchema.

const express = require('express');
const bcrypt = require('bcryptjs');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminUserUpdateSchema,
  adminUserCreateSchema,
} = require('../../schemas/admin');
const { requireFreshAdmin } = require('../../middleware/requireFreshAdmin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');
// Phase-4.5 D-01 — auth chain mounted app-level; do NOT remount middleware here.
// <Plan 1 owns this file; Plan 5 extends with hard-delete cascade>
const router = express.Router();

// GET /api/admin/users
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const users = await req.prisma.user.findMany({
      select: {
        id: true, name: true, phone: true, mbPoints: true,
        status: true, isAdmin: true, createdAt: true,
        _count: { select: { userCards: true, accounts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    });
    const total = await req.prisma.user.count();
    res.json({ users, total, limit: safeLimit, offset: safeOffset });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/users/:id — Phase 3 / 03-10 / SEC-14 + SEC-10 + D-07
// Phase 4.5 / D-03 — mutation now wrapped in auditLog.withAudit().
router.put(
  '/:id',
  reqValidator(adminUserUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = { ...req.validated };
      if (data.pin) data.pin = await bcrypt.hash(data.pin, 10);

      const updated = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.USER_UPDATE,
          targetType: 'User',
          targetId: id,
          requestId: req.id,
        },
        async (tx, setAudit) => {
          const before = await tx.user.findUnique({
            where: { id },
            select: {
              id: true, name: true, phone: true, mbPoints: true,
              status: true, isAdmin: true,
            },
          });
          if (!before) throw new AppError('NOT_FOUND', 404);
          const after = await tx.user.update({
            where: { id },
            data,
            select: {
              id: true, name: true, phone: true, mbPoints: true,
              status: true, isAdmin: true,
            },
          });
          setAudit({ before, after });
          return after;
        }
      );

      // D-07 — drop the freshness cache entry so demote/promote takes effect immediately
      if ('isAdmin' in data) requireFreshAdmin.invalidate(req.params.id);

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/users — Phase 3 / 03-10 / SEC-14 + SEC-10
// Phase 4.5 / D-03 — wrapped in auditLog.withAudit().
router.post(
  '/',
  reqValidator(adminUserCreateSchema),
  async (req, res, next) => {
    try {
      const {
        name, phone, pin, mbPoints = 0, status = 'STANDARD', isAdmin = false,
      } = req.validated;
      const hashedPin = await bcrypt.hash(pin, 10);

      const created = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.USER_CREATE,
          targetType: 'User',
          requestId: req.id,
        },
        async (tx, setAudit) => {
          const user = await tx.user.create({
            data: { name, phone, pin: hashedPin, mbPoints, status, isAdmin },
          });
          await tx.bankAccount.create({
            data: {
              userId: user.id,
              name: 'Главный счёт',
              type: 'main',
              balance: 0,
              currency: 'RUB',
            },
          });
          // Дефолтная активная колода для каждого нового пользователя
          await tx.deck.create({
            data: {
              userId: user.id,
              name: 'Моя колода',
              isActive: true,
            },
          });
          setAudit({ targetId: user.id, before: null, after: user });
          return user;
        }
      );

      res.json(created);
    } catch (err) {
      (req.log ?? logger).error({ err }, 'Create user error');
      next(err);
    }
  }
);

// GET /api/admin/users/:id/accounts — preserved from legacy admin.js
router.get('/:id/accounts', async (req, res) => {
  try {
    const accounts = await req.prisma.bankAccount.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки счетов' });
  }
});

module.exports = router;
