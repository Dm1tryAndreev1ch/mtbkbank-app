// backend/src/routes/admin/users.js
//
// Phase 4.5 / 04.5-01 / D-01 — users sub-router (Plan 5 will extend with
// soft/hard delete + cascade integration test). Plan 1 migrates the existing
// users CRUD (LIST, PUT, POST) and /users/:id/accounts from the deleted
// singular routes/admin.js, replacing $transaction+writeAudit with
// auditLog.withAudit per D-03.
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const bcrypt = require('bcryptjs');
// IMPORTANT: require the auditLog MODULE (not destructured). The Plan-6 D-04
// rollback test monkey-patches auditLog.writeAudit; destructured imports
// freeze the reference and the patch becomes a no-op (Pitfall 2).
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminUserUpdateSchema,
  adminUserCreateSchema,
} = require('../../schemas/admin');
const { requireFreshAdmin } = require('../../middleware/requireFreshAdmin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

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
// Phase 4.5 / 04.5-01 / D-03 — rewrapped with auditLog.withAudit.
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

      // D-07 — drop the freshness cache entry so demote/promote takes effect immediately.
      if ('isAdmin' in data) requireFreshAdmin.invalidate(req.params.id);

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/users — Phase 3 / 03-10 / SEC-14 + SEC-10
// Phase 4.5 / 04.5-01 / D-03 — rewrapped with auditLog.withAudit.
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

// GET /api/admin/users/:id/accounts
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
