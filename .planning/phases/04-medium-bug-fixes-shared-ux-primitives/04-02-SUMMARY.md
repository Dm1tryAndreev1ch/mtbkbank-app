---
phase: 04-medium-bug-fixes-shared-ux-primitives
plan: 02
subsystem: backend
tags: [bugfix, security, validation, indexes, prisma, websockets, schemas]
requires: [phase-3-schemas/auth.js, phase-3-middleware/reqValidator.js, phase-3-middleware/authRateLimits.js, phase-3-middleware/auth.js verifyAccessToken, phase-3-errors/codebook.js]
provides:
  - "B-M1 regression test pinning Redis-backed loginLimiter (5/15min)"
  - "B-M2 DB-side refresh token expiry + REFRESH_TOKEN_EXPIRED 401"
  - "B-M3 register name length validation (2..80)"
  - "B-M4 CONCURRENT (userId, createdAt DESC) indexes on Transaction + Notification + UserCard(userId)"
  - "B-M5 WS verifier identity assertion (shared with HTTP)"
  - "B-M6 sourceSchema / grantCardSchema (admin grant rejects unknown enums)"
  - "B-M7 SACRIFICE_OVERHEAL guard in cardEngine.sacrifice"
  - "B-M8 notificationDeferred flag on POST /api/transactions/transfer"
  - "ESM schema shim (backend/src/schemas/index.mjs) — Wave-0 prereq for plan 04-04 admin"
affects:
  - mobile error rendering paths (REFRESH_TOKEN_EXPIRED → mobile must route to /login, not silent-refresh; deferred to 04-03/04-04)
  - admin grant-card UI (now MAY pass `source` field; 'ADMIN' default preserved)
tech-stack:
  added: []
  patterns:
    - "Hand-written CONCURRENT index migrations paired with @@index `map:` directives so prisma migrate diff stays clean"
    - "ESM-over-CJS schema shim via createRequire"
    - "Live-app prisma exposed via app.prisma for fault-injection in integration tests"
key-files:
  created:
    - backend/prisma/migrations/20260427_refresh_token_expires_at/migration.sql
    - backend/prisma/migrations/20260427_idx_transaction_user_created/migration.sql
    - backend/prisma/migrations/20260427_idx_notification_user_created/migration.sql
    - backend/prisma/migrations/20260427_idx_user_card_user/migration.sql
    - backend/src/schemas/index.mjs
    - backend/tests/integration/concurrent-indexes-smoke.test.js
    - backend/tests/integration/refresh-token-expiration.test.js
    - backend/tests/integration/name-length-validation.test.js
    - backend/tests/integration/auth-rate-limit.test.js
    - backend/tests/integration/ws-auth-parity.test.js
    - backend/tests/integration/card-source-enum.test.js
    - backend/tests/integration/sacrifice-maxhealth.test.js
    - backend/tests/integration/notification-error-surface.test.js
  modified:
    - backend/prisma/schema.prisma
    - backend/src/routes/auth.js
    - backend/src/routes/cards.js
    - backend/src/routes/transactions.js
    - backend/src/routes/admin.js
    - backend/src/services/cardEngine.js
    - backend/src/schemas/cards.js
    - backend/src/schemas/admin.js
    - backend/src/errors/messages.js
    - backend/src/index.js
decisions:
  - "Adapted plan: schema has no RefreshToken model — refreshToken is a scalar column on User. Added User.refreshTokenExpiresAt instead of inventing a new model. Same B-M2 outcome, less migration churn, no additional FK rewrites."
  - "schemas/admin.js#adminGrantCardSchema is now an alias of schemas/cards.js#grantCardSchema so the source enum has a single Zod source of truth (per D-15)."
  - "Exported app.prisma from backend/src/index.js (test-affordance only; production code paths still use req.prisma) so B-M8 fault-injection does not require a parallel app instance."
  - "REFRESH_TOKEN_EXPIRED returns res.status(401).json({ error: 'REFRESH_TOKEN_EXPIRED', message: '...' }) — distinct shape from /refresh's other errors so the mobile client can branch deterministically."
metrics:
  duration_minutes: 19
  completed: 2026-04-26
  tasks_completed: 4
  bugs_closed: 8
  test_files_added: 8
  migration_files_added: 4
---

# Phase 4 Plan 02: Backend MEDIUM Bug Closure (B-M1..B-M8) Summary

Closed 8 backend MEDIUM bugs (B-M1..B-M8) with 8 new integration test files
pinning each. Shipped 4 new Prisma migrations (3 CONCURRENT indexes +
RefreshToken expiry column) and applied them to the test DB via
`prisma migrate deploy`. All 4 plan tasks complete; the human-action
checkpoint (Task 2) was evaluated and applied automatically per worktree
parallel-execution instructions (DB reachable via local docker-compose
test stack).

## What Shipped

### B-M1 — Login rate limit (verification only)
- `backend/tests/integration/auth-rate-limit.test.js` pins the existing
  Redis-backed `loginLimiter` (5 attempts / 15min, IP /64 keyed).
- 6th login attempt within window → 429
  `{ error: 'RATE_LIMIT_EXCEEDED' }`. No code change.

### B-M2 — Refresh token expiration
- `User.refreshTokenExpiresAt DateTime?` column added via migration
  `20260427_refresh_token_expires_at`; backfilled to `createdAt + 30d`.
- `routes/auth.js` writes the stamp on `/login` + `/register` + `/refresh`
  rotation (`REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000`).
- `/refresh` rejects expired tokens with
  `401 { error: 'REFRESH_TOKEN_EXPIRED', message: 'Сессия истекла, войдите снова' }`.
- New error code `REFRESH_TOKEN_EXPIRED` in `errors/messages.js`.

### B-M3 — Register name length (verification only)
- `schemas/auth.js#nameSchema` already enforces `.min(2).max(80)`
  (Phase 3). Test `name-length-validation.test.js` pins the contract.

### B-M4 — Hot-path indexes
- Migrations:
  - `20260427_idx_transaction_user_created` — CONCURRENT
    `(userId, createdAt DESC)` on `Transaction`.
  - `20260427_idx_notification_user_created` — CONCURRENT
    `(userId, createdAt DESC)` on `Notification`.
  - `20260427_idx_user_card_user` — CONCURRENT `(userId)` on `UserCard`.
- `schema.prisma` `@@index([...], map: "...")` directives keep
  `prisma migrate diff` clean against the hand-written SQL names.
- Each index migration's line 1 is exactly `-- prisma-disable-transaction`.

### B-M5 — WS verifier parity (verification only)
- `backend/tests/integration/ws-auth-parity.test.js` identity-checks
  that `verifyAccessToken` imported by `middleware/auth.js` is the
  same function used by `websocket/index.js`. Plus connect/reject
  functional tests with valid / wrong `JWT_SECRET`.
- No code change — Phase 3 / 03-12 already wired the shared verifier.

### B-M6 — Card source enum
- `schemas/cards.js#sourceSchema` mirrors Prisma `enum CardSource`
  (PURCHASE | TRADE | QUEST | ADMIN | GIFT | SHOP).
- New `grantCardSchema` accepts optional `source` field; `schemas/admin.js`
  re-exports it as `adminGrantCardSchema` (single source of truth).
- `routes/admin.js` POST `/grant-card` threads `source` from validated
  body, defaulting to `'ADMIN'` when omitted (existing flows unaffected).

### B-M7 — Sacrifice maxHealth guard
- `services/cardEngine.js#sacrificeCard` rejects when
  `target.health >= target.collectionCard.maxHealth` with
  `SACRIFICE_OVERHEAL` error code.
- `routes/cards.js` POST `/sacrifice` now wired through
  `reqValidator(sacrificeSchema)` and surfaces SACRIFICE_OVERHEAL as
  `400 { error: 'SACRIFICE_OVERHEAL', message: '...' }`.
- Existing `Math.min(maxHealth, ...)` cap retained for defense in depth.
- New error code `SACRIFICE_OVERHEAL` in `errors/messages.js`.

### B-M8 — Notification create failure surfacing
- `routes/transactions.js` POST `/transfer` notification.create
  wrapped in try/catch that:
  - Logs `(req.log ?? logger).error({ err, userId, txId }, 'Notification create failed')`
  - Sets `notificationDeferred = true`
  - Lets the transaction succeed (notifications are best-effort)
- Response now includes `notificationDeferred: boolean`.
- `backend/src/index.js` exports `app.prisma` so the integration test
  can spy on the live PrismaClient instance without standing up a
  parallel app.

### Wave-0 prereq for plan 04-04 — ESM schema shim
- `backend/src/schemas/index.mjs` — pure re-export shim over the CJS
  `auth.js` + `cards.js` modules using `createRequire`. Admin (Vite/ESM)
  imports from this single source of truth so client+server validation
  cannot drift (D-15). NO schemas defined in the shim itself.

## Migrations Applied

```
$ npx prisma migrate deploy
Applying migration `20260427_idx_notification_user_created`
Applying migration `20260427_idx_transaction_user_created`
Applying migration `20260427_idx_user_card_user`
Applying migration `20260427_refresh_token_expires_at`

The following migration(s) have been applied:
…
All migrations have been successfully applied.
```

`prisma migrate status` now reports "Database schema is up to date!".

## Tests

8 new integration tests, all green:

| Bug   | File                                                      | Pass |
|-------|-----------------------------------------------------------|------|
| B-M1  | `backend/tests/integration/auth-rate-limit.test.js`       | yes  |
| B-M2  | `backend/tests/integration/refresh-token-expiration.test.js` | yes |
| B-M3  | `backend/tests/integration/name-length-validation.test.js` | yes |
| B-M4  | `backend/tests/integration/concurrent-indexes-smoke.test.js` | yes |
| B-M5  | `backend/tests/integration/ws-auth-parity.test.js`        | yes  |
| B-M6  | `backend/tests/integration/card-source-enum.test.js`      | yes  |
| B-M7  | `backend/tests/integration/sacrifice-maxhealth.test.js`   | yes  |
| B-M8  | `backend/tests/integration/notification-error-surface.test.js` | yes |

Full backend suite: **246 pass, 1 pre-existing failure, 2 todo** (out of 249).

The single failure is in `tests/integration/redis-failure-fallback.test.js`
(test "Redis 'error' event emits warn + Sentry breadcrumb …" — firstCount
is 0 instead of >=1). The file was modified at session start (prior to
hard-reset) and the failure shape is independent of every 04-02 file.
Logged to `deferred-items.md` per scope-boundary rule.

`bash scripts/regression-guard.sh` → `Regression-guard passed.`

## Error Codebook Additions

In `backend/src/errors/messages.js`:

- `REFRESH_TOKEN_EXPIRED: 'Сессия истекла, войдите снова'`
- `SACRIFICE_OVERHEAL: 'Целевая карта уже на максимуме HP'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan referenced a `RefreshToken` Prisma model that doesn't exist**
- **Found during:** Task 1 / pre-implementation read of schema.prisma
- **Issue:** Plan instructed adding `RefreshToken.expiresAt` column on a `RefreshToken` model. The actual schema stores `refreshToken String?` as a scalar field on `User`. There IS no `RefreshToken` model.
- **Fix:** Added `User.refreshTokenExpiresAt DateTime?` instead. Backfilled with `createdAt + 30 days WHERE refreshToken IS NOT NULL`. Auth handlers updated to write the stamp at issuance. Same B-M2 contract outcome (DB-side expiry rejects stale tokens) with less migration churn.
- **Files modified:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260427_refresh_token_expires_at/migration.sql`, `backend/src/routes/auth.js`
- **Commit:** `0313bd4` (initial), `74cee23-ish` (force-add migrations)

**2. [Rule 3 — Blocking] `**/migration.sql` is in repo root .gitignore; first commit dropped the migration files**
- **Found during:** post-commit `git log --stat` review
- **Issue:** Existing migration.sql files in the repo were force-added historically. `git add` (without `-f`) silently ignores new ones.
- **Fix:** `git add -f` for the 4 new migration files; created a follow-up commit. Verified `git ls-files backend/prisma/migrations/20260427_*` returns all 4.
- **Files modified:** none (recovery commit only)
- **Commit:** Migration force-add commit

**3. [Rule 3 — Blocking] B-M8 test could not spy on the route's prisma instance**
- **Found during:** Task 4 first run of `notification-error-surface.test.js`
- **Issue:** `backend/src/index.js` constructs its own `new PrismaClient()` (line 45) — distinct from the test setup singleton. `jest.spyOn(testPrisma.notification, 'create')` did not intercept the route's call.
- **Fix:** Added `module.exports.prisma = prisma` to `backend/src/index.js` so the test can spy on the actual instance the route uses. Test-affordance only; production code paths still flow through `req.prisma`.
- **Files modified:** `backend/src/index.js`
- **Commit:** Task-4 commit

### Out of Scope

- `backend/tests/integration/redis-failure-fallback.test.js` — pre-existing failure unrelated to this plan. Logged to `deferred-items.md`.

## Self-Check: PASSED

Created files (verified via `[ -f ... ]`):
- FOUND: backend/prisma/migrations/20260427_refresh_token_expires_at/migration.sql
- FOUND: backend/prisma/migrations/20260427_idx_transaction_user_created/migration.sql
- FOUND: backend/prisma/migrations/20260427_idx_notification_user_created/migration.sql
- FOUND: backend/prisma/migrations/20260427_idx_user_card_user/migration.sql
- FOUND: backend/src/schemas/index.mjs
- FOUND: backend/tests/integration/concurrent-indexes-smoke.test.js
- FOUND: backend/tests/integration/refresh-token-expiration.test.js
- FOUND: backend/tests/integration/name-length-validation.test.js
- FOUND: backend/tests/integration/auth-rate-limit.test.js
- FOUND: backend/tests/integration/ws-auth-parity.test.js
- FOUND: backend/tests/integration/card-source-enum.test.js
- FOUND: backend/tests/integration/sacrifice-maxhealth.test.js
- FOUND: backend/tests/integration/notification-error-surface.test.js

All commit hashes recorded by `git log --oneline -5` after this plan.
