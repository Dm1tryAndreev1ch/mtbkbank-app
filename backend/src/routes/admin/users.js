// backend/src/routes/admin/users.js
//
// Phase 4.5 / 04.5-01 / D-01 — users sub-router.
// Phase 4.5 / 04.5-05 / ADMIN-12 — soft/hard delete with cascade + paged list
// normalization to {items, total, page, limit} + deletedAt:null filtering.
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
  adminUserHardDeleteSchema,
} = require('../../schemas/admin');
const { requireFreshAdmin } = require('../../middleware/requireFreshAdmin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/users
// Phase 4.5 / 04.5-05 / ADMIN-12 — paged list normalized to UI-SPEC shape
// {items, total, page, limit}. Soft-deleted users (deletedAt != null) are
// excluded by default. The legacy {users, total, limit, offset} keys are kept
// alongside for back-compat with the existing admin SPA UsersPage load() until
// the SPA is fully migrated to the new shape (it reads `data.users ?? []`
// today and ignores extra keys, so adding `items` is safe).
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, page } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    // Accept either ?page=N (new) or ?offset=N (legacy). page wins when present.
    const safeOffset = page
      ? Math.max((parseInt(page) || 1) - 1, 0) * safeLimit
      : Math.max(parseInt(offset) || 0, 0);
    const safePage = page
      ? Math.max(parseInt(page) || 1, 1)
      : Math.floor(safeOffset / safeLimit) + 1;

    const where = { deletedAt: null };
    const users = await req.prisma.user.findMany({
      where,
      select: {
        id: true, name: true, phone: true, mbPoints: true,
        status: true, isAdmin: true, createdAt: true,
        _count: { select: { userCards: true, accounts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    });
    const total = await req.prisma.user.count({ where });
    res.json({
      // New shape per UI-SPEC § "API response shape (locked)".
      items: users,
      total,
      page: safePage,
      limit: safeLimit,
      // Legacy keys preserved for the existing UsersPage data.users access.
      users,
      offset: safeOffset,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/users/:id — Phase 3 / 03-10 / SEC-14 + SEC-10 + D-07
// Phase 4.5 / 04.5-01 / D-03 — rewrapped with auditLog.withAudit.
// Phase 4.5 / 04.5-05 — refuses to update soft-deleted users (deletedAt:null
// filter inside the pre-update findUnique guard).
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
          const before = await tx.user.findFirst({
            where: { id, deletedAt: null },
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

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id?mode=soft|hard
// Phase 4.5 / 04.5-05 / ADMIN-12.
//
// Default mode = 'soft' (sets deletedAt = now() on the user; cascade FKs are
// untouched). ?mode=hard performs tx.user.delete; Plan-1 Migration A schema
// cascade FKs cause owned data (BankAccount/BankCard/UserCard/Deck/
// Transaction/Notification/UserQuest/Subscription/SpendingLimit) to vanish
// atomically, CardTrade.fromUserId/toUserId nullify (SetNull), and historical
// AuditLog rows where actorId pointed to the deleted user retain actorId=null
// (AuditLog.actor onDelete:SetNull encoded in Plan-1 Migration A).
//
// Self-delete forbidden — admin cannot hard-delete their own account.
// ---------------------------------------------------------------------------
router.delete('/:id',
  reqValidator(adminUserHardDeleteSchema, 'query'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { mode } = req.validated; // 'soft' default | 'hard'

      if (mode === 'hard') {
        // Self-delete guard — enforced BEFORE opening the tx so admin cannot
        // race themselves into a stale-claim scenario (T-04.5-05-02).
        if (req.userId === id) {
          throw new AppError('USER_SELF_DELETE_FORBIDDEN', 409);
        }

        await auditLog.withAudit(
          req.prisma,
          {
            actorId: req.userId,
            action: auditLog.AUDIT_ACTIONS.USER_HARD_DELETE,
            targetType: 'User',
            targetId: id,
            requestId: req.id,
          },
          async (tx, setAudit) => {
            const before = await tx.user.findUnique({
              where: { id },
              select: { id: true, name: true, phone: true, status: true },
            });
            if (!before) throw new AppError('NOT_FOUND', 404);
            // Plan-1 Migration A cascade FKs do all the heavy lifting here.
            await tx.user.delete({ where: { id } });
            // Drop any cached freshness entry for the deleted user (mirrors
            // the PUT-handler invalidation for isAdmin demote/promote).
            requireFreshAdmin.invalidate(id);
            setAudit({ before, after: null });
            return null;
          }
        );
        return res.status(204).send();
      }

      // mode === 'soft' (default).
      const result = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.USER_SOFT_DELETE,
          targetType: 'User',
          targetId: id,
          requestId: req.id,
        },
        async (tx, setAudit) => {
          const before = await tx.user.findUnique({
            where: { id },
            select: { id: true, deletedAt: true, name: true, phone: true },
          });
          if (!before) throw new AppError('NOT_FOUND', 404);
          if (before.deletedAt) throw new AppError('USER_ALREADY_DELETED', 409);
          const after = await tx.user.update({
            where: { id },
            data: { deletedAt: new Date() },
            select: { id: true, deletedAt: true },
          });
          setAudit({ before, after });
          return after;
        }
      );
      // Drop freshness cache entry for the soft-deleted user.
      requireFreshAdmin.invalidate(id);
      return res.json(result);
    } catch (err) {
      (req.log ?? logger).error({ err, userId: req.params.id }, 'Admin user delete error');
      next(err);
    }
  }
);

module.exports = router;
