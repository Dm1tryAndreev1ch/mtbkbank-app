// backend/src/schemas/index.mjs
// Phase 4 / 04-02 / D-15 — ESM re-export shim over CJS Zod schema modules.
// Admin (Vite/ESM) imports from this file so it shares the EXACT validation
// surface the backend enforces. DO NOT duplicate schemas — drift defeats D-15.
//
// To add another domain's schemas, append a `require('./<domain>.js')` line and
// re-export each named schema. NEVER define a schema in this file.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const auth = require('./auth.js');
const cards = require('./cards.js');

// auth.js
export const phoneSchema      = auth.phoneSchema;
export const pinSchema        = auth.pinSchema;
export const nameSchema       = auth.nameSchema;
export const cardNumberSchema = auth.cardNumberSchema;
export const loginSchema      = auth.loginSchema;
export const registerSchema   = auth.registerSchema;
export const refreshSchema    = auth.refreshSchema;

// cards.js
export const buyCardSchema    = cards.buyCardSchema;
export const sacrificeSchema  = cards.sacrificeSchema;
export const convertSchema    = cards.convertSchema;
export const sourceSchema     = cards.sourceSchema;
export const grantCardSchema  = cards.grantCardSchema;
