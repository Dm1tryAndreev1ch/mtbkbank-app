// backend/src/routes/admin/transactions.js
//
// Phase 4.5 / 04.5-02 / ADMIN-02 — admin Transaction endpoints (paged search +
// reverse with idempotency via Transaction.reversedById from Migration B).
// Plan 1 migrated /simulate-transaction here as simulateTransactionHandler;
// this plan adds GET / paged-search and POST /:id/reverse.
//
// Auth chain mounted app-level in src/index.js — do NOT remount.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { reqValidator } = require('../../middleware/reqValidator');
const { adminTransactionReverseSchema } = require('../../schemas/admin');
const { processCardDrop } = require('../../services/cardEngine');
const { AppError } = require('../../errors/AppError');
const { logger } = require('../../logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/admin/transactions — paged search.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.accountId) {
      const accId = String(req.query.accountId);
      where.OR = [{ fromAccountId: accId }, { toAccountId: accId }];
    }
    if (req.query.type) where.type = String(req.query.type);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.q) {
      const q = String(req.query.q);
      const orClauses = [
        { id: { contains: q } },
        { merchant: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: orClauses }];
        delete where.OR;
      } else {
        where.OR = orClauses;
      }
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }

    const [items, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Admin transactions list error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/transactions/:id/reverse — create compensating transaction.
// Audit: TRANSACTION_REVERSE
// Idempotency: original.reversedById is UNIQUE; second attempt → 409
//   TRANSACTION_ALREADY_REVERSED via P2002 catch.
// Reversibility: only status='completed' rows can be reversed.
// ---------------------------------------------------------------------------
router.post('/:id/reverse', reqValidator(adminTransactionReverseSchema), async (req, res, next) => {
  const id = req.params.id;
  const { reason } = req.validated;
  try {
    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.TRANSACTION_REVERSE,
        targetType: 'Transaction',
        targetId: id,
        requestId: req.id,
      },
      async (tx, setAudit) => {
        const original = await tx.transaction.findUnique({ where: { id } });
        if (!original) throw new AppError('NOT_FOUND', 404);
        if (original.status !== 'completed') {
          throw new AppError('TRANSACTION_NOT_REVERSIBLE', 409);
        }
        if (original.reversedById) {
          throw new AppError('TRANSACTION_ALREADY_REVERSED', 409);
        }

        const compensating = await tx.transaction.create({
          data: {
            userId: original.userId,
            fromAccountId: original.toAccountId || null,
            toAccountId: original.fromAccountId || null,
            amount: original.amount,
            currency: original.currency,
            type: original.type,
            category: original.category,
            merchant: original.merchant ? `[ОТМЕНА] ${original.merchant}` : '[ОТМЕНА]',
            merchantIcon: original.merchantIcon,
            description: `Компенсирующая операция для ${original.id}: ${reason}`,
            status: 'completed',
          },
        });

        if (original.fromAccountId) {
          await tx.bankAccount.update({
            where: { id: original.fromAccountId },
            data: { balance: { increment: original.amount } },
          });
        }
        if (original.toAccountId) {
          await tx.bankAccount.update({
            where: { id: original.toAccountId },
            data: { balance: { decrement: original.amount } },
          });
        }

        const updatedOriginal = await tx.transaction.update({
          where: { id: original.id },
          data: { reversedById: compensating.id, status: 'reversed' },
        });

        setAudit({
          before: { status: original.status, reversedById: null },
          after: { status: updatedOriginal.status, reversedById: compensating.id },
          reason,
        });

        return { compensating, original: updatedOriginal };
      }
    );
    res.json(result);
  } catch (err) {
    const isP2002 =
      err && (err.code === 'P2002' || (err.meta && err.meta.target && String(err.meta.target).includes('reversedById')));
    if (isP2002) {
      return next(new AppError('TRANSACTION_ALREADY_REVERSED', 409));
    }
    (req.log ?? logger).error({ err }, 'Admin transaction reverse error');
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /simulate — migrated by Plan 1; preserved verbatim.
// ---------------------------------------------------------------------------
async function simulateTransactionHandler(req, res, next) {
  try {
    const { userId, amount, category, merchant, merchantIcon, type = 'PURCHASE' } = req.body;
    let { accountId } = req.body;

    if (!accountId) {
      const mainAccount = await req.prisma.bankAccount.findFirst({ where: { userId, type: 'main' } });
      if (!mainAccount) {
        const anyAccount = await req.prisma.bankAccount.findFirst({ where: { userId } });
        if (!anyAccount) return res.status(404).json({ error: 'У пользователя нет счетов' });
        accountId = anyAccount.id;
      } else {
        accountId = mainAccount.id;
      }
    }

    const account = await req.prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Укажите корректную сумму' });
    }

    const isCredit = type === 'TRANSFER_IN' || type === 'TOPUP';
    const txType = type || 'PURCHASE';

    const result = await auditLog.withAudit(
      req.prisma,
      {
        actorId: req.userId,
        action: auditLog.AUDIT_ACTIONS.TRANSACTION_SIMULATE,
        targetType: 'Transaction',
        requestId: req.id,
        reason: `simulated ${txType} amount=${numericAmount} for userId=${userId}`,
      },
      async (tx, setAudit) => {
        let updatedAccount;
        if (!isCredit) {
          const debitResult = await tx.bankAccount.updateMany({
            where: { id: accountId, balance: { gte: numericAmount } },
            data: { balance: { decrement: numericAmount } },
          });
          if (debitResult.count !== 1) throw new Error('INSUFFICIENT');
          updatedAccount = await tx.bankAccount.findUnique({ where: { id: accountId } });
        } else {
          updatedAccount = await tx.bankAccount.update({
            where: { id: accountId },
            data: { balance: { increment: numericAmount } },
          });
        }

        const t = await tx.transaction.create({
          data: {
            fromAccountId: accountId,
            userId,
            amount: numericAmount,
            type: txType,
            status: 'completed',
            category: category || 'Покупки',
            merchant: merchant || 'Тестовый мерчант',
            merchantIcon: merchantIcon || 'store',
            description: 'Админ: симуляция транзакции',
          },
        });
        setAudit({ targetId: t.id, before: null, after: t });
        return { transaction: t, account: updatedAccount };
      }
    );

    let droppedCard = null;
    if (!isCredit && txType === 'PURCHASE') {
      try {
        droppedCard = await processCardDrop(req.prisma, userId, result.transaction.id);
      } catch (dropErr) {
        (req.log ?? logger).error({ err: dropErr }, 'Admin simulate card drop error (non-critical)');
      }
    }

    res.json({
      transaction: result.transaction,
      account: result.account,
      droppedCard,
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT') {
      return res.status(400).json({ error: 'Недостаточно средств на момент списания' });
    }
    (req.log ?? logger).error({ err }, 'Simulate transaction error');
    next(err);
  }
}

router.post('/simulate', simulateTransactionHandler);

module.exports = router;
module.exports.simulateTransactionHandler = simulateTransactionHandler;
