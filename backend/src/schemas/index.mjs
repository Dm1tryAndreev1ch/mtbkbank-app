// backend/src/schemas/index.mjs
// Phase 4 / 04-02 / D-15 — ESM re-export shim over CJS Zod schema modules.
// Admin (Vite/ESM) imports from this file so it shares the EXACT validation
// surface the backend enforces. DO NOT duplicate schemas — drift defeats D-15.
//
// To add another domain's schemas, append an `import` line and re-export each
// named schema. NEVER define a schema in this file.
//
// Phase 4 / 04-04 — switched from `createRequire(import.meta.url)` to plain
// `import` syntax. The previous form pulled in `node:module`, which Vite/Rollup
// cannot bundle for the browser (admin build broke). Plain `import` of the .js
// CJS files works in BOTH Node (native CJS interop) and Vite (CJS-to-ESM
// transform), so the shim is now isomorphic.

// CJS modules expose `module.exports = { ... }`. Vite/Rollup synthesize the
// keys as named exports on the module namespace object (via the bundled CJS
// interop plugin), and Node ≥22 does the same when it can statically analyse
// the CJS module. `import * as` therefore gives us a single import shape that
// works in BOTH the bundler (admin build) and Node (backend tests / shim
// loading at process boot).
import * as auth from './auth.js';
import * as cards from './cards.js';

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
