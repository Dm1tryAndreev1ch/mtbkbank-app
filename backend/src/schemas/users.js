// backend/src/schemas/users.js
// Phase 3 / D-09 / D-11 / SEC-09 — Zod schemas for /api/users/*.
//
// userSearchQuerySchema enforces the SEC-09 "≥10 chars" rule (the existing route
// currently uses q.length < 3 — this schema tightens the contract; route wiring
// happens in 03-12).
//
// userUpdateSchema mirrors PUT /api/users/me { name?, avatarUrl? }.

const { z } = require('zod');
const { nameSchema } = require('./auth');

const userSearchQuerySchema = z.object({
  q: z.string().min(10, 'Запрос должен содержать минимум 10 символов'),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const userUpdateSchema = z.object({
  name: nameSchema.optional(),
  avatarUrl: z.string().url('Некорректный URL аватара').optional(),
});

module.exports = {
  userSearchQuerySchema,
  userUpdateSchema,
};
