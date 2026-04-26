// backend/src/schemas/cards.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/cards/*.
// Mirrors routes/cards.js:
//   POST /buy:       { collectionCardId }
//   POST /sacrifice: { sacrificeId, targetId }
//   POST /convert:   { cardId }   — note: existing route uses `cardId`, not `userCardId`.
//                                   Per CLAUDE.md API-contract directive we mirror the
//                                   actual field name.

const { z } = require('zod');

// Phase 4 / 04-02 / B-M6 — Zod mirror of Prisma `enum CardSource`
// (PURCHASE | TRADE | QUEST | ADMIN | GIFT | SHOP). Single source of truth lives
// in prisma/schema.prisma; if you add a value there, mirror it here AND in
// schemas/index.mjs (admin's import path).
const sourceSchema = z.enum(['PURCHASE', 'TRADE', 'QUEST', 'ADMIN', 'GIFT', 'SHOP']);

const buyCardSchema = z.object({
  collectionCardId: z.string().min(1, 'Укажите карту'),
});

const sacrificeSchema = z.object({
  sacrificeId: z.string().min(1, 'Укажите карту для жертвы'),
  targetId: z.string().min(1, 'Укажите целевую карту'),
});

const convertSchema = z.object({
  cardId: z.string().min(1, 'Укажите карту'),
});

// Phase 4 / 04-02 / B-M6 — admin can optionally specify the source attribution
// when granting a card (defaults to 'ADMIN' in the route handler when omitted).
// reqValidator strips unknown fields by Zod default; passing source='INVALID'
// trips a 400 VALIDATION_FAILED with issues mentioning 'source'.
const grantCardSchema = z.object({
  userId: z.string().min(1, 'Укажите пользователя'),
  collectionCardId: z.string().min(1, 'Укажите карту'),
  source: sourceSchema.optional(),
});

module.exports = {
  buyCardSchema,
  sacrificeSchema,
  convertSchema,
  sourceSchema,
  grantCardSchema,
};
