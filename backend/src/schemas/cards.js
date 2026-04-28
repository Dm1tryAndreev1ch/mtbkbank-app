// backend/src/schemas/cards.js
// Phase 3 / D-09 / D-11 — Zod schemas for /api/cards/*.
// ESM so Vite can bundle this into the admin SPA without a bare require().

import { z } from 'zod';

// Phase 4 / 04-02 / B-M6 — Zod mirror of Prisma `enum CardSource`.
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
