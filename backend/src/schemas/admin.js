// backend/src/schemas/admin.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/admin/*.
// Mirrors routes/admin.js:
//   PUT  /users/:id:   { name?, mbPoints?, status?, pin? }
//   POST /users:       { name, phone, pin, mbPoints?, status?, isAdmin? }
//   POST /grant-card:  { userId, collectionCardId }
//
// status enum is sourced from prisma/schema.prisma `enum UserStatus`:
//   STANDARD | SILVER | GOLD | PLATINUM | BLOCKED

const { z } = require('zod');
const { phoneSchema, pinSchema, nameSchema } = require('./auth');

const userStatusSchema = z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM', 'BLOCKED']);

const adminUserUpdateSchema = z.object({
  name: nameSchema.optional(),
  mbPoints: z.number().int().nonnegative().optional(),
  status: userStatusSchema.optional(),
  pin: pinSchema.optional(),
  isAdmin: z.boolean().optional(),
});

const adminUserCreateSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  pin: pinSchema,
  mbPoints: z.number().int().nonnegative().optional(),
  status: userStatusSchema.optional(),
  isAdmin: z.boolean().optional(),
});

// Phase 4 / 04-02 / B-M6 — admin grant accepts optional `source` enum mirrored
// from Prisma `enum CardSource`. Re-exports schemas/cards.js#grantCardSchema so
// there is a single Zod source of truth for the source-enum contract.
const { grantCardSchema, sourceSchema } = require('./cards');
const adminGrantCardSchema = grantCardSchema;

module.exports = {
  adminUserUpdateSchema,
  adminUserCreateSchema,
  adminGrantCardSchema,
  userStatusSchema,
  sourceSchema,
};
