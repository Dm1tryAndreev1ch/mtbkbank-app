// backend/src/schemas/cards.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/cards/*.
// Mirrors routes/cards.js:
//   POST /buy:       { collectionCardId }
//   POST /sacrifice: { sacrificeId, targetId }
//   POST /convert:   { cardId }   — note: existing route uses `cardId`, not `userCardId`.
//                                   Per CLAUDE.md API-contract directive we mirror the
//                                   actual field name.

const { z } = require('zod');

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

module.exports = {
  buyCardSchema,
  sacrificeSchema,
  convertSchema,
};
