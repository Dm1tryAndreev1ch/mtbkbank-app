// backend/src/schemas/index.mjs
// Phase 4 / 04-02 / D-15 — ESM re-export barrel for Zod schema modules.
// Admin (Vite/ESM) imports from this file so it shares the EXACT validation
// surface the backend enforces. DO NOT duplicate schemas — drift defeats D-15.
//
// auth.js and cards.js are pure ESM (`export const ...`). The correct way to
// re-export named ESM bindings is `export * from`, NOT `import * as X` +
// `export const Y = X.Y`. The latter creates a namespace object that carries a
// synthetic `default` key, which Vite/Rollup cannot resolve via star export
// entries and throws:
//   SyntaxError: Importing binding name 'default' cannot be resolved
//   by star export entries.
//
// `export * from` is statically analysable, works in both Node ESM and
// Vite/Rollup, and adds zero runtime overhead.
export * from './auth.js';
export * from './cards.js';
