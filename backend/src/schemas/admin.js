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

// =============================================================================
// Phase 4.5 / 04.5-01 / Task 2 — admin Zod schema scaffold.
// One schema per admin endpoint shipping in Plans 2-5. reqValidator(<schema>)
// gates the body before the handler runs; the handler reads req.validated.
// =============================================================================
const adminAccountFreezeSchema = z.object({
  reason: z.string().max(500).optional(),
});
const adminAccountUnfreezeSchema = z.object({
  reason: z.string().max(500).optional(),
});
const adminBalanceAdjustSchema = z.object({
  delta: z.number().finite(),
  reason: z.string().min(3).max(500),
});
const adminTransactionReverseSchema = z.object({
  reason: z.string().min(3).max(500),
});
const adminBankCardBlockSchema = z.object({
  reason: z.string().max(500).optional(),
});
// Phase 4.5 / 04.5-03 / ADMIN-03 — Plan-1 scaffold originally specified
// `cardType` but the BankCard Prisma model has columns `type`, `tier`,
// `maskedNumber` (no `cardType`). Schema corrected here (deviation Rule 3).
// `maskedNumber` is optional — handler synthesizes "**** {last4}" when omitted.
const adminBankCardIssueSchema = z.object({
  userId: z.string().min(1),
  accountId: z.string().min(1),
  type: z.string().min(1),
  tier: z.string().min(1),
  maskedNumber: z.string().min(1).max(64).optional(),
});
const adminUserCardHpSchema = z.object({
  health: z.number().int().nonnegative(),
});
const adminQuestCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  reward: z.number().int().nonnegative(),
  target: z.number().int().positive(),
});
const adminQuestUpdateSchema = adminQuestCreateSchema.partial();
const adminLimitCreateSchema = z.object({
  userId: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().int().nonnegative(),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
});
const adminLimitUpdateSchema = adminLimitCreateSchema.partial();
const adminPaymentStatusSchema = z.object({
  status: z.string().min(1),
  reason: z.string().min(3).max(500),
});
// Phase 4.5 / 04.5-02 / ADMIN-09 — extended to include `icon`, `category`,
// `nextPayment` because the underlying Subscription Prisma model requires
// `icon` and `nextPayment` (Plan 1 scaffold under-specified vs schema.prisma;
// deviation Rule 3). `amount` widened from int → number to accept Float
// (Subscription.amount is Float in the DB).
const adminSubscriptionCreateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(120),
  amount: z.number().nonnegative(),
  icon: z.string().min(1).max(64).optional().default('subscriptions'),
  category: z.string().min(1).max(120).optional(),
  nextPayment: z.string().datetime().optional(),
  period: z.enum(['MONTHLY', 'YEARLY']).optional(),
});
const adminSubscriptionUpdateSchema = adminSubscriptionCreateSchema.partial();
const adminNotificationBroadcastSchema = z.object({
  audience: z.discriminatedUnion('type', [
    z.object({ type: z.literal('USER'), userId: z.string().min(1) }),
    z.object({ type: z.literal('SEGMENT'), segment: z.literal('GOLD') }),
  ]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.unknown()).optional(),
});
const adminTradeCancelSchema = z.object({
  reason: z.string().min(3).max(500),
});
const adminUserHardDeleteSchema = z.object({
  mode: z.enum(['soft', 'hard']).default('soft'),
  confirmPhone: z.string().optional(),
});
const adminDeckBreakActiveSchema = z.object({
  reason: z.string().max(500).optional(),
});
const adminUserQuestResetSchema = z.object({
  reason: z.string().max(500).optional(),
});

module.exports = {
  adminUserUpdateSchema,
  adminUserCreateSchema,
  adminGrantCardSchema,
  userStatusSchema,
  sourceSchema,
  // Phase 4.5 / 04.5-01 / Task 2 — admin domain schemas (Plans 2-5 consume).
  adminAccountFreezeSchema,
  adminAccountUnfreezeSchema,
  adminBalanceAdjustSchema,
  adminTransactionReverseSchema,
  adminBankCardBlockSchema,
  adminBankCardIssueSchema,
  adminUserCardHpSchema,
  adminQuestCreateSchema,
  adminQuestUpdateSchema,
  adminLimitCreateSchema,
  adminLimitUpdateSchema,
  adminPaymentStatusSchema,
  adminSubscriptionCreateSchema,
  adminSubscriptionUpdateSchema,
  adminNotificationBroadcastSchema,
  adminTradeCancelSchema,
  adminUserHardDeleteSchema,
  adminDeckBreakActiveSchema,
  adminUserQuestResetSchema,
};
