// backend/src/schemas/auth.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/auth/*.
// ESM so Vite can bundle this into the admin SPA without a bare require().
// Node loads ESM-syntax .js files from CJS packages via static import interop.

import { z } from 'zod';
import { luhnCheck } from './_helpers/luhn.js';

export const phoneSchema = z
  .string()
  .regex(/^\+\d{11,15}$/, 'Укажите телефон в формате +79001234567');

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, 'ПИН-код должен состоять из 4 цифр');

export const nameSchema = z
  .string()
  .min(2, 'Минимум 2 символа')
  .max(80, 'Максимум 80 символов');

// PAN: 13–19 digits, valid Luhn checksum.
export const cardNumberSchema = z
  .string()
  .regex(/^\d{13,19}$/, 'Номер карты должен содержать 13–19 цифр')
  .refine(luhnCheck, { message: 'Некорректный номер карты' });

export const loginSchema = z.object({
  phone: phoneSchema,
  pin: pinSchema,
});

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  pin: pinSchema,
  cardNumber: cardNumberSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token обязателен'),
});
