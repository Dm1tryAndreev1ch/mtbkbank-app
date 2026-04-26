// Phase 4 / 04-04 / D-15 — admin re-export barrel of backend Zod schemas.
//
// Single source of truth: backend defines validation rules (CommonJS), an ESM
// shim at backend/src/schemas/index.mjs re-exports them, and admin imports from
// that shim so client + server validate against the EXACT same Zod surface.
// Drift between admin and backend is impossible by construction (T-04-04-01).
//
// NEVER define a schema here. To add a new domain's schemas, extend
// backend/src/schemas/index.mjs first, then add the export below.
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
} from '../../../backend/src/schemas/index.mjs';
