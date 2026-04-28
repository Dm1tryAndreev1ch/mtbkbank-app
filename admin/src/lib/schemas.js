// Phase 4 / 04-04 / D-15 — admin re-export barrel of backend Zod schemas.
//
// Single source of truth: backend defines validation rules (CommonJS), an ESM
// shim at backend/src/schemas/index.mjs re-exports them, and admin imports from
// that shim so client + server validate against the EXACT same Zod surface.
// Drift between admin and backend is impossible by construction (T-04-04-01).
//
// NEVER define a schema here. To add a new domain's schemas, extend
// backend/src/schemas/index.mjs first, then add the export below.
//
// FIX: `export { ... } from` (re-export shorthand) causes Vite/Rollup to emit
// "Importing binding name 'default' cannot be resolved by star export entries"
// because CJS modules get a synthetic `default` key that is invisible to the
// ES module star-export resolution algorithm. Splitting into a plain `import`
// followed by a named `export` forces Vite to resolve each binding individually
// and avoids the synthetic-default trap.
import {
  phoneSchema,
  pinSchema,
  nameSchema,
  cardNumberSchema,
  loginSchema,
  registerSchema,
  refreshSchema,
  buyCardSchema,
  sacrificeSchema,
  convertSchema,
  sourceSchema,
  grantCardSchema,
} from '../../../backend/src/schemas/index.mjs';

export {
  phoneSchema,
  pinSchema,
  nameSchema,
  cardNumberSchema,
  loginSchema,
  registerSchema,
  refreshSchema,
  buyCardSchema,
  sacrificeSchema,
  convertSchema,
  sourceSchema,
  grantCardSchema,
};
