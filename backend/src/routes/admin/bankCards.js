// Phase 4.5 / 04.5-01 / D-01 — Admin bankCards sub-router skeleton.
//
// Plan 1 deliverable: stub that hosts the legacy /api/admin/cards collection-
// template CRUD (kept under its old route names so existing admin SPA cards
// page keeps working). Plan 3 layers ADMIN-03 (block / issue / delete real
// BankCards) on top of these endpoints.
//
// Auth chain mounted app-level (D-01); do NOT remount middleware here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// Legacy collection-template CRUD migrated from routes/admin.js.
// These endpoints live at /api/admin/bankCards/templates/* (renamed from
// /api/admin/cards/* — see SUMMARY for the rename rationale; admin SPA still
// posts to /admin/cards which the legacy route under index.js will forward
// during Plan 3 transition. For Plan 1 the canonical mount is here.)
// ---------------------------------------------------------------------------

// GET /api/admin/bankCards/templates
router.get('/templates', async (req, res) => {
  try {
    const cards = await req.prisma.collectionCard.findMany({
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/bankCards/templates — whitelist полей; mass assignment устранён
router.post('/templates', async (req, res, next) => {
  try {
    const {
      name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const created = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.CARD_TEMPLATE_CREATE,
        targetType: 'CollectionCard',
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const card = await tx.collectionCard.create({
          data: {
            name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
            cashbackPercent, maxHealth, dropRate,
            isActive: isActive !== undefined ? isActive : true,
          },
        });
        setAudit({ targetId: card.id, before: null, after: card });
        return card;
      }
    );
    res.json(created);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Create card template error');
    next(err);
  }
});

// PUT /api/admin/bankCards/templates/:id — whitelist полей
router.put('/templates/:id', async (req, res, next) => {
  try {
    const {
      name, description, rarity, brandName, brandIcon, brandLogo, imageUrl,
      cashbackPercent, maxHealth, dropRate, isActive,
    } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (rarity !== undefined) data.rarity = rarity;
    if (brandName !== undefined) data.brandName = brandName;
    if (brandIcon !== undefined) data.brandIcon = brandIcon;
    if (brandLogo !== undefined) data.brandLogo = brandLogo;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (cashbackPercent !== undefined) data.cashbackPercent = cashbackPercent;
    if (maxHealth !== undefined) data.maxHealth = maxHealth;
    if (dropRate !== undefined) data.dropRate = dropRate;
    if (isActive !== undefined) data.isActive = isActive;

    const { id } = req.params;
    const updated = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.CARD_TEMPLATE_UPDATE,
        targetType: 'CollectionCard',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.collectionCard.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.collectionCard.update({ where: { id }, data });
        setAudit({ before, after });
        return after;
      }
    );
    res.json(updated);
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Update card template error');
    next(err);
  }
});

// DELETE /api/admin/bankCards/templates/:id — soft-delete via isActive=false
router.delete('/templates/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.CARD_TEMPLATE_DELETE,
        targetType: 'CollectionCard',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const before = await tx.collectionCard.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 404);
        const after = await tx.collectionCard.update({
          where: { id },
          data: { isActive: false },
        });
        setAudit({ before, after });
        return after;
      }
    );
    res.json({ success: true });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Delete card template error');
    next(err);
  }
});

module.exports = router;
