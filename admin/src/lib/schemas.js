// admin/src/lib/schemas.js
// Zod validation schemas for the admin SPA.
//
// Previously this file re-exported from backend/src/schemas/index.mjs via a
// relative cross-package import. That caused:
//
//   SyntaxError: Importing binding name 'default' cannot be resolved
//   by star export entries.
//
// Root cause: backend/package.json has no "type":"module", so Node treats
// all .js files as CJS. auth.js/cards.js use ESM `export const` syntax inside
// a CJS package. Vite sees them as CJS and injects a synthetic `default`
// binding which is illegal to re-export via star entries per the ES spec.
//
// Fix: define schemas here directly as pure ESM. Same Zod rules as backend.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives (mirrors backend/src/schemas/auth.js)
// ---------------------------------------------------------------------------
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

// Luhn check inlined — avoids importing the helper across package boundary.
function luhnCheck(pan) {
  if (!pan || pan.length < 13 || pan.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let n = parseInt(pan[i], 10);
    if (Number.isNaN(n)) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

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

// ---------------------------------------------------------------------------
// Card schemas (mirrors backend/src/schemas/cards.js)
// ---------------------------------------------------------------------------
export const sourceSchema = z.enum(['PURCHASE', 'TRADE', 'QUEST', 'ADMIN', 'GIFT', 'SHOP']);

export const buyCardSchema = z.object({
  collectionCardId: z.string().min(1, 'Укажите карту'),
});

export const sacrificeSchema = z.object({
  sacrificeId: z.string().min(1, 'Укажите карту для жертвы'),
  targetId: z.string().min(1, 'Укажите целевую карту'),
});

export const convertSchema = z.object({
  cardId: z.string().min(1, 'Укажите карту'),
});

export const grantCardSchema = z.object({
  userId: z.string().min(1, 'Укажите пользователя'),
  collectionCardId: z.string().min(1, 'Укажите карту'),
  source: sourceSchema.optional(),
});
