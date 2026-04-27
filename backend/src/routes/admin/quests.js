// backend/src/routes/admin/quests.js
//
// Phase 4.5 / 04.5-03 / ADMIN-06 — admin Quest CRUD + UserQuest reset.
//
// Endpoints (mounted at /api/admin/quests via admin/index.js):
//   GET    /                         paged list
//   POST   /                         create  (audit QUEST_CREATE)
//   PUT    /:id                      update  (audit QUEST_UPDATE)
//   POST   /:id/deactivate           isActive=false  (audit QUEST_DEACTIVATE)
//   DELETE /:id                      SOFT delete via isActive=false  (audit QUEST_DELETE)
//   POST   /user-quest/:id/reset     reset progress + completedAt  (audit USERQUEST_RESET)
//
// IMPORTANT (T-04.5-03-02): DELETE is a SOFT delete — Quest hard-delete
// would orphan UserQuest rows since UserQuest.questId has no cascade FK.
// Audit payload tags `intent: 'delete'` so audit log readers can disambiguate
// from a plain deactivate.
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const {
  adminQuestCreateSchema,
  adminQuestUpdateSchema,
  adminUserQuestResetSchema,
} = require('../../schemas/admin');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/quests — paged list.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      req.prisma.quest.findMany({
        orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
      req.prisma.quest.count(),
    ]);
    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin quests list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/quests — create.
// ---------------------------------------------------------------------------
router.post('/', reqValidator(adminQuestCreateSchema), async (req, res, next) => {
  try {
    const data = { ...req.validated };
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.QUEST_CREATE,
        targetType: 'Quest',
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const created = await tx.quest.create({ data });
        setAudit({ targetId: created.id, before: null, after: created });
        return created;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin quest create error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/quests/:id — update.
// ---------------------------------------------------------------------------
router.put('/:id', reqValidator(adminQuestUpdateSchema), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = { ...req.validated };
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.QUEST_UPDATE,
        targetType: 'Quest',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.quest.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.quest.update({ where: { id }, data });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin quest update error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/quests/:id/deactivate — isActive=false (idempotent).
// ---------------------------------------------------------------------------
router.post('/:id/deactivate', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.QUEST_DEACTIVATE,
        targetType: 'Quest',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.quest.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.quest.update({
          where: { id },
          data: { isActive: false },
        });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin quest deactivate error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/quests/:id — SOFT delete via isActive=false.
// (T-04.5-03-02: hard delete would orphan UserQuest rows. Audit payload
// `intent: 'delete'` disambiguates from a plain deactivate.)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.QUEST_DELETE,
        targetType: 'Quest',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.quest.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.quest.update({
          where: { id },
          data: { isActive: false },
        });
        setAudit({
          before,
          after: { ...after, intent: 'delete' },
        });
        return { id, deleted: true };
      }
    );
    res.json(result);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin quest delete error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/quests/user-quest/:id/reset — reset a UserQuest progress.
// ---------------------------------------------------------------------------
router.post('/user-quest/:id/reset', reqValidator(adminUserQuestResetSchema), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const { reason } = req.validated;
      const result = await auditLog.withAudit(
        req.prisma,
        {
          actorId: req.userId,
          action: auditLog.AUDIT_ACTIONS.USERQUEST_RESET,
          targetType: 'UserQuest',
          targetId: id,
          requestId: req.id,
          reason: reason || undefined,
        },
        async (tx, setAudit) => {
          const before = await tx.userQuest.findUnique({ where: { id } });
          if (!before) throw new AppError('NOT_FOUND', 404);
          const after = await tx.userQuest.update({
            where: { id },
            data: { progress: 0, completed: false, claimed: false, completedAt: null },
          });
          setAudit({
            before: {
              progress: before.progress,
              completed: before.completed,
              completedAt: before.completedAt,
            },
            after: {
              progress: after.progress,
              completed: after.completed,
              completedAt: after.completedAt,
            },
          });
          return after;
        }
      );
      res.json(result);
    } catch (err) {
      (req.log ?? logger).error({ err }, 'Admin user-quest reset error');
      next(err);
    }
  });

module.exports = router;
