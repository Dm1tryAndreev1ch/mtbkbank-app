// backend/src/schemas/transactions.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/transactions/*.
// Mirrors the request body shapes routes/transactions.js currently accepts:
//   POST /transfer:    { fromAccountId, toAccountId | recipient, amount, description }
//   POST /transfer-own:{ fromAccountId, toAccountId, amount, description }
//   POST /payment:     legacy/admin-side analog — kept here for the per-domain schema
//                      file pattern; route wiring lands later.
//
// Amount uses positive integer (D-11). The transactions route currently parseFloat()s
// rawAmount; route wiring (03-09) will adapt the call signature, this schema pins the
// invariant that amount > 0 and not NaN/negative.

const { z } = require('zod');

// D-11: amount is positive integer (kopecks/minor units assumed; route wiring may relax to z.number().positive()).
const amountSchema = z.number().int().positive();

const MAX_TRANSFER_AMOUNT = 1_000_000;

// Mirror routes/transactions.js POST /transfer body, including the recipient resolver branch.
const transferSchema = z
  .object({
    fromAccountId: z.string().min(1, 'Укажите счёт списания'),
    toAccountId: z.string().min(1).optional(),
    toUserId: z.string().min(1).optional(), // contract surface for future toUserId-based transfers
    recipient: z.string().min(1).optional(), // phone for resolve-then-transfer mode
    amount: amountSchema.max(MAX_TRANSFER_AMOUNT, `Максимальная сумма перевода — ${MAX_TRANSFER_AMOUNT}`),
    description: z.string().max(200).optional(),
  })
  .refine(
    (d) => d.toAccountId || d.toUserId || d.recipient,
    { message: 'Укажите получателя', path: ['toAccountId'] }
  );

const transferOwnSchema = z.object({
  fromAccountId: z.string().min(1, 'Укажите счёт списания'),
  toAccountId: z.string().min(1, 'Укажите счёт зачисления'),
  amount: amountSchema.max(MAX_TRANSFER_AMOUNT, `Максимальная сумма перевода — ${MAX_TRANSFER_AMOUNT}`),
  description: z.string().max(200).optional(),
});

// paymentSchema covers the merchant-payment surface (admin simulate-transaction analog).
const paymentSchema = z.object({
  fromAccountId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  amount: amountSchema,
  category: z.string().min(1).optional(),
  merchant: z.string().min(1).optional(),
  merchantIcon: z.string().min(1).optional(),
  description: z.string().max(200).optional(),
});

module.exports = {
  transferSchema,
  transferOwnSchema,
  paymentSchema,
  amountSchema,
};
