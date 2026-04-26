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

const adminGrantCardSchema = z.object({
  userId: z.string().min(1, 'Укажите пользователя'),
  collectionCardId: z.string().min(1, 'Укажите карту'),
});

module.exports = {
  adminUserUpdateSchema,
  adminUserCreateSchema,
  adminGrantCardSchema,
  userStatusSchema,
};
