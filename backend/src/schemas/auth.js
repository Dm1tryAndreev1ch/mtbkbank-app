// backend/src/schemas/auth.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/auth/*.
// Mirrors the request body shapes that backend/src/routes/auth.js currently accepts:
//   loginHandler: { phone, pin }
//   registerHandler: { firstName, lastName, cardNumber, phone, pin }
//   refresh route: { refreshToken }
// Per CLAUDE.md API-contract directive — do not invent fields.

const { z } = require('zod');
const { luhnCheck } = require('./_helpers/luhn');

const phoneSchema = z
  .string()
  .regex(/^\+\d{11,15}$/, 'Укажите телефон в формате +79001234567');

const pinSchema = z
  .string()
  .regex(/^\d{4}$/, 'ПИН-код должен состоять из 4 цифр');

const nameSchema = z
  .string()
  .min(2, 'Минимум 2 символа')
  .max(80, 'Максимум 80 символов');

// PAN: 13–19 digits, valid Luhn checksum.
const cardNumberSchema = z
  .string()
  .regex(/^\d{13,19}$/, 'Номер карты должен содержать 13–19 цифр')
  .refine(luhnCheck, { message: 'Некорректный номер карты' });

const loginSchema = z.object({
  phone: phoneSchema,
  pin: pinSchema,
});

// register accepts firstName + lastName per existing handler in routes/auth.js.
const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  pin: pinSchema,
  cardNumber: cardNumberSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token обязателен'),
});

module.exports = {
  loginSchema,
  registerSchema,
  refreshSchema,
  phoneSchema,
  pinSchema,
  nameSchema,
  cardNumberSchema,
};
