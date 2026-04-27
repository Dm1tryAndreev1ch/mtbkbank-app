// backend/src/routes/admin/transactions.js
//
// Phase 4.5 / 04.5-01 / D-01 — transactions sub-router. Plan 2 (Money cluster)
// fills this with paged search + reverse-transaction (with idempotency via
// Migration B Transaction.reversedById). Plan 1 migrates the existing
// /admin/simulate-transaction here as `simulateTransactionHandler` and
// re-exports it so admin/index.js can keep the legacy URL working.
//
// Auth chain mounted app-level in src/index.js — do NOT remount here.

const express = require('express');
const auditLog = require('../../services/auditLog');
const { processCardDrop } = require('../../services/cardEngine');
const { logger } = require('../../logger');

const router = express.Router();

// POST /api/admin/simulate-transaction — Phase 3 / 03-10 / SEC-14
// Phase 4.5 / 04.5-01 / D-03 — rewrapped with auditLog.withAudit.
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

// Canonical path under /transactions for forward compat (Plan 2 extends).
router.post('/simulate', simulateTransactionHandler);

module.exports = router;
module.exports.simulateTransactionHandler = simulateTransactionHandler;
