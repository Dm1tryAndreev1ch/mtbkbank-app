// backend/src/routes/admin/bankCards.js
//
// Phase 4.5 / 04.5-01 / D-01 — bankCards sub-router. Plan 3 (Cards cluster)
// will fill this with the real BankCard CRUD (block/issue/delete). Plan 1
// migrates the existing /admin/cards collection-card-template CRUD here so
// the legacy SPA path /api/admin/cards/* keeps working (mounted via
// admin/index.js as `router.use('/cards', require('./bankCards'))`).
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// GET /api/admin/cards (legacy) — collection-card templates list.
router.get('/', async (req, res) => {
  try {
    const cards = await req.prisma.collectionCard.findMany({
      orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
    });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/cards (legacy) — whitelist fields; mass-assignment guarded.
router.post('/', async (req, res, next) => {
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

// PUT /api/admin/cards/:id — whitelist fields; mass-assignment guarded.
router.put('/:id', async (req, res, next) => {
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

// DELETE /api/admin/cards/:id — soft-delete via isActive=false.
router.delete('/:id', async (req, res, next) => {
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
