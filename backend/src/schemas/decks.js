// backend/src/schemas/decks.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/decks/*.
// Mirrors routes/decks.js:
//   POST /:                { name }
//   PUT /:id:              { name?, cardIds? } where cardIds.length <= 5
//
// Deck mutation transaction wiring lands in 03-11.

const { z } = require('zod');

const deckCreateSchema = z.object({
  name: z.string().min(1, 'Укажите название колоды').max(80),
});

const deckUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  cardIds: z
    .array(z.string().min(1))
    .max(5, 'Максимум 5 карт в колоде')
    .optional(),
});

module.exports = {
  deckCreateSchema,
  deckUpdateSchema,
};
