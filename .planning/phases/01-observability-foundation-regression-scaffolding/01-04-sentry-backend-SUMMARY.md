---
phase: 01-observability-foundation-regression-scaffolding
plan: 04
subsystem: observability
tags: [sentry, sentry-node, pii-redaction, rate-limit, fingerprint, hp-tick, beforeSend, threat-mitigation, OBS-02]

# Dependency graph
requires:
  - 01-00-regression-scaffolding (regression-guard.sh + tests/setup.js used to confirm placement)
  - 01-01-pino-logging (logger consumed by hpTickReporter for layer-1 always-log)
  - 01-02-envalid-fail-fast (env.SENTRY_DSN devDefault path; instrument.js still reads process.env directly)
  - 01-03-graceful-shutdown-middleware (PLAN 04 placeholder slots in index.js + try/catch require staging)
provides:
  - backend/src/instrument.js (Sentry.init + piiBeforeSend + scrubObject + scrubString — the canonical first-line require)
  - backend/src/services/hpTickReporter.js (Redis-backed fingerprint rate-limit, 5 events / 5min, with process-local fallback)
  - backend/tests/sentry-redaction.test.js (15 tests covering all 7 event paths + scrubString patterns + case-insensitive keys + depth limit + empty-DSN boot)
  - backend/tests/hp-tick-reporter.test.js (8 tests covering Redis-up rate-limit + Redis-down fallback + fingerprint + tag + context + always-logs)
  - backend/tests/instrument-first.test.js (4 static AST-style assertions for index.js placement of Sentry handlers)
  - backend/src/index.js wired (line-1 hard require, per-request requestId scope tag, Sentry.setupExpressErrorHandler, cron .catch through reportHpTickError)
  - backend/src/cache/index.js Sentry breadcrumb on initial-connect failure
  - "@sentry/node@^10.50.0" in backend/package.json
affects:
  - 01-05-sentry-mobile (parallel; shares the same forbidden-key list contract: pin/password/cardNumber/Authorization/refreshToken/Cookie)
  - 01-06-sentry-admin (parallel; shares the same forbidden-key list contract)
  - 01-07-app-error-catalog (errorNormalizer placeholder still present; will mount AFTER Sentry.setupExpressErrorHandler so Sentry sees raw shape)
  - 01-08-health-routes (will add dev-only /__test__/sentry-error endpoint to verify wiring; PLAN 08 placeholder still present)
  - 01-99-phase1-verify (PII-Redaction Acceptance Bar can now exercise piiBeforeSend against real synthetic events)

# Tech tracking
tech-stack:
  added:
    - "@sentry/node@^10.50.0 (Sentry Node SDK with OpenTelemetry-style require interception)"
  patterns:
    - "instrument.js as line-1 hard require — runs BEFORE dotenv/envalid; reads process.env directly; silent-skip Sentry.init when DSN is empty"
    - "piiBeforeSend redacts at all 7 event paths via scrubObject (case-insensitive key match, depth-6 short-circuit) + scrubString (JWT + 13-19 digit card-number + key=value strip with [-exclusion to avoid re-eating already-redacted tokens)"
    - "event.user reset to { id } only — strips email/phone/ip_address/username before send"
    - "hpTickReporter as a service module — lazy-requires ../cache to avoid module-load-order coupling; mock-prefixed jest.mock factory refs to satisfy babel-jest hoist guard"
    - "Redis-backed fingerprint rate-limit (incr + EXPIRE TTL 300; cap 5/window) with a process-local guard fallback when Redis itself is the failing dep"
    - "scrubString regex order: JWT + card-number patterns FIRST (more specific), then key=value strip with `[^\"',}\\s\\[]+` to skip `[REDACTED_*]` tokens already produced by earlier passes"

key-files:
  created:
    - backend/src/instrument.js
    - backend/src/services/hpTickReporter.js
    - backend/tests/sentry-redaction.test.js
    - backend/tests/hp-tick-reporter.test.js
    - backend/tests/instrument-first.test.js
  modified:
    - backend/package.json (+@sentry/node@^10.50.0)
    - backend/package-lock.json (lock update for @sentry/* tree)
    - backend/src/index.js (4 edits — line-1 hard require, per-request scope tag, Sentry.setupExpressErrorHandler, cron .catch wiring)
    - backend/src/cache/index.js (Sentry breadcrumb on initial-connect failure, PATTERNS.md line 242)

key-decisions:
  - "Fixed scrubString regex ordering bug in the paste-ready instrument.js: ran JWT + card-number patterns BEFORE the key=value strip, and excluded `[` from the strip's value charset. Test 8 expected `cardNumber=4111111111111111` to be redacted as both `cardNumber=[REDACTED]` (key strip) AND surface `[REDACTED_CARD]` for the digits — original regex order produced only `cardNumber=[REDACTED]` because the strip ate the digits before the card-number pattern could match. Reorder + bracket exclusion satisfies both intents (Rule 1 - Bug)."
  - "Renamed jest.mock factory spy refs from `fooSpy` to `mockFooSpy` (mock-prefixed). babel-jest hoists jest.mock() above the file's top-level code; out-of-scope refs are rejected unless prefixed with `mock` (case-insensitive). Plan paste-ready test had unprefixed names that failed hoist guard (Rule 1 - Bug)."
  - "Wrapped the cache Sentry.addBreadcrumb in try/catch — instrument.js may not be loaded in test contexts that mock cache (jest.mock('../src/cache') in hp-tick-reporter tests). Original plan intended the breadcrumb to be unconditional; defensive try/catch keeps the breadcrumb best-effort without breaking unit tests (Rule 3 - Blocking)."
  - "Pulled the `Sentry` const into module scope inside backend/src/index.js via `const { Sentry } = require('./instrument')` immediately before the per-request scope tag middleware, so Sentry.setupExpressErrorHandler downstream can reuse the same reference (no re-require). Plan task 3 step C explicitly noted this expectation."

requirements-completed: [OBS-02]

# Metrics
duration: 18min
completed: 2026-04-25
---

# Phase 01 Plan 04: Sentry Backend Summary

**`@sentry/node@10` initialized as the line-1 require of backend/src/index.js with paste-ready `piiBeforeSend` redacting `pin/password/cardNumber/Authorization/refreshToken/Cookie` across all 7 event paths; HP-tick errors routed through `hpTickReporter.reportHpTickError` for Redis-backed fingerprint rate-limiting (5 events / 5min) so a Redis flicker firing 1440 ticks/day cannot exhaust the free-tier Sentry quota.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-25T16:46:00Z
- **Completed:** 2026-04-25T17:03:37Z
- **Tasks:** 3
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- `backend/src/instrument.js` created with paste-ready Sentry.init + 7-path PII redaction; module load with empty `SENTRY_DSN` exits 0 (silent skip)
- `backend/src/services/hpTickReporter.js` created with Redis incr/EXPIRE rate-limit (cap 5 events/5min) + `setFingerprint(['hp-tick-error'])` + process-local fallback when Redis is the failing dep
- `backend/src/index.js` four PLAN 04 placeholder slots flipped to live calls (line-1 hard require, per-request `Sentry.getCurrentScope().setTag('requestId', req.id)`, `Sentry.setupExpressErrorHandler(app)`, cron `.catch` through `reportHpTickError`)
- `backend/src/cache/index.js` emits `Sentry.addBreadcrumb({category:'redis', message:'initial connection failed'})` on initial connect failure (PATTERNS.md line 242 deferred from plan 01)
- 27 new tests green (15 redaction + 8 hp-tick + 4 instrument-first); all 9 backend test suites pass (65 tests + 6 todo) including the prior plans' middleware-order, graceful-shutdown, regression-phase1, cardEngine, logger, env suites
- Closes threats T-1-01 (PII info-disclosure), T-1-02 (error.message leak), T-1-03 (instrument.js placement), T-1-05 (Sentry quota DoS)

## PLAN 04 Placeholder Slot Status

| Slot | Plan-03 staged | Plan-04 wired |
|------|----------------|---------------|
| Line-1 instrument require | `try { require('./instrument'); } catch (e) {...}` | Hard `require('./instrument');` |
| Per-request scope tag (after `req.prisma`) | `// PLAN 04: …` placeholder comment | Live `Sentry.getCurrentScope().setTag('requestId', req.id)` middleware |
| Express error handler (after 404 / before errorNormalizer) | `// PLAN 04: Sentry.setupExpressErrorHandler(app);` | Live `Sentry.setupExpressErrorHandler(app)` |
| Cron `.catch` (HP-tick) | `.catch((err) => logger.error({ err, event: 'hp-tick-error' }, ...))` | `.catch((err) => require('./services/hpTickReporter').reportHpTickError(err, { tickIntervalMs }))` |

PLAN 07 (`notFoundHandler`/`errorNormalizer`) and PLAN 08 (`/healthz`/`/readyz`/`/version` + dev-only `/__test__/sentry-error`) placeholders are intentionally still present — owned by future plans.

## Sentry Init Guard

`backend/src/instrument.js` line 67-77:
```js
const dsn = process.env.SENTRY_DSN || '';
if (dsn) {
  Sentry.init({ dsn, environment, release, tracesSampleRate, integrations: [Sentry.expressIntegration()], beforeSend: piiBeforeSend });
}
```
Verified `SENTRY_DSN= node -e "require('./src/instrument')"` exits 0 — dev/test boot is silent-skip per D-02. `tracesSampleRate` is `0.1` in `NODE_ENV=production`, `1.0` otherwise (D-04).

## Task Commits

1. **Task 1: Install @sentry/node@10 + create instrument.js + sentry-redaction.test.js** — `6ce9df6` (feat)
2. **Task 2: Create hpTickReporter.js + hp-tick-reporter.test.js** — `4c0881a` (feat)
3. **Task 3: Wire instrument.js + Sentry handlers into index.js + cache breadcrumb + instrument-first.test.js** — `6bb4eea` (feat)

## Files Created/Modified

**Created:**
- `backend/src/instrument.js` — Sentry init + PII-redacting beforeSend (paste-ready RESEARCH §6.2 with regex-order bugfix)
- `backend/src/services/hpTickReporter.js` — Redis-backed fingerprint rate-limiter for HP-tick errors
- `backend/tests/sentry-redaction.test.js` — 15 tests covering all 7 event paths + scrubString + case-insensitive + depth-limit + empty-DSN boot
- `backend/tests/hp-tick-reporter.test.js` — 8 tests covering Redis-up rate-limit + Redis-down fallback + fingerprint + tag + context + logger always
- `backend/tests/instrument-first.test.js` — 4 static assertions for index.js placement of Sentry handlers

**Modified:**
- `backend/package.json` — added `@sentry/node@^10.50.0` to dependencies (alphabetical slot)
- `backend/package-lock.json` — lock update for `@sentry/*` transitive tree
- `backend/src/index.js` — 4 edits: line-1 hard require, per-request requestId scope tag, Sentry.setupExpressErrorHandler, cron .catch through hpTickReporter
- `backend/src/cache/index.js` — Sentry.addBreadcrumb on initial-connect failure (try/catch wrapped)

## Decisions Made

- Followed plan paste-ready code with two corrections (see Deviations) and one defensive wrap (cache breadcrumb in try/catch) so test contexts that mock cache do not fail to load instrument.js.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scrubString regex ordering produced wrong output for `cardNumber=<digits>`**
- **Found during:** Task 1 (sentry-redaction tests after creating instrument.js verbatim from RESEARCH §6.2)
- **Issue:** The paste-ready `scrubString` ran the key=value strip pattern (`(["']?(?:pin|password|cardNumber|refreshToken)["']?\s*[:=]\s*["']?)[^"',}\s]+`) BEFORE the card-number pattern (`\b\d{13,19}\b`). For input `cardNumber=4111111111111111`, the strip turned the whole thing into `cardNumber=[REDACTED]` so the digits never reached the card-number pattern. Test 8 (breadcrumbs[].message) expected the output to contain `[REDACTED_CARD]` AND have `4111111111111111` removed — the original regex order produced `cardNumber=[REDACTED]` which has no `[REDACTED_CARD]`.
- **Fix:** Reordered to JWT pattern → card-number pattern → key=value strip; changed strip's value charset from `[^"',}\s]+` to `[^"',}\s\[]+` so the strip does not re-eat already-redacted tokens like `[REDACTED_CARD]` (the `[` is excluded, so the `+` quantifier fails on a value that begins with `[`).
- **Files modified:** `backend/src/instrument.js`
- **Verification:** All 15 sentry-redaction tests pass, including the breadcrumb-message and `request.data.cardNumber` cases.
- **Committed in:** `6ce9df6` (Task 1 commit)

**2. [Rule 1 - Bug] jest.mock factory refs failed babel-jest hoist guard (test would not parse)**
- **Found during:** Task 2 (hp-tick-reporter test parse failure)
- **Issue:** Plan paste-ready test used unprefixed spy names (`captureExceptionSpy`, `setFingerprintSpy`, etc.) inside `jest.mock('../src/instrument', () => { ... })` factories. Jest hoists `jest.mock()` calls ABOVE the file's top-level `const ... = jest.fn()` declarations; the babel-jest hoist guard then rejects out-of-scope refs unless they are prefixed with `mock` (case-insensitive). Test suite failed to even parse: `ReferenceError: ... module factory of jest.mock() is not allowed to reference any out-of-scope variables. Invalid variable access: setFingerprintSpy`.
- **Fix:** Renamed to `mockCaptureExceptionSpy`, `mockSetFingerprintSpy`, `mockSetTagSpy`, `mockSetContextSpy`, `mockLoggerErrorSpy`. Updated all body assertions accordingly. Added a comment explaining the hoist-guard convention so future plans pasting similar test scaffolding don't repeat the trap.
- **Files modified:** `backend/tests/hp-tick-reporter.test.js`
- **Verification:** All 8 hp-tick-reporter tests pass.
- **Committed in:** `4c0881a` (Task 2 commit)

**3. [Rule 3 - Blocking] Wrapped cache `Sentry.addBreadcrumb` in try/catch**
- **Found during:** Task 3 (cache/index.js edit + planning the cache import surface)
- **Issue:** Plan task 3 step E used an unconditional `const { Sentry } = require('../instrument')` inside the cache initial-connect failure path. But `hp-tick-reporter.test.js` does `jest.mock('../src/cache', () => ({ redisClient: mockRedis }))` — the cache module IS still loaded transitively in some other test setups, and instrument.js may not be available in those contexts (e.g., when a future test mocks `../instrument` AND cache is still loaded as a side-effect via the redisClient export). Best-effort breadcrumb is the safer pattern; the breadcrumb is purely diagnostic context, not a correctness requirement.
- **Fix:** Wrapped the breadcrumb call in `try { ... } catch {}` with an explanatory comment. The breadcrumb still fires when instrument.js is loaded normally (production + sentry-redaction.test.js + dev), and gracefully no-ops when instrument is mocked or unavailable.
- **Files modified:** `backend/src/cache/index.js`
- **Verification:** All 9 backend test suites pass; full smoke-boot with empty DSN exits 0; the happy-path breadcrumb still wires when instrument.js is the real module.
- **Committed in:** `6bb4eea` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs in plan paste-ready code, 1 Rule 3 defensive wrap)
**Impact on plan:** All deviations were necessary for tests to pass and for the hp-tick-reporter unit tests to coexist with the new cache breadcrumb. The plan's intent is preserved end-to-end (all 7 event paths redacted, all 4 PLAN 04 placeholder slots flipped, all 27 new tests green). No scope creep — fixes are within the plan's stated files.

## Issues Encountered

- **Worktree branch race-condition note:** Other parallel-wave agents (01-05 mobile, 01-06 admin) committed onto the same shared branch ref while my work was in progress, so `git log` shows interleaved commits from other agents. My commits (6ce9df6, 4c0881a, 6bb4eea) are all on the chain and atomic to my plan's files (backend/* only). The orchestrator handles the merge — this is informational, not a blocker.
- **regression-guard.sh exit 1:** Pre-existing failure in `mobile/stores/useStore.ts` (empty `catch {}` blocks). NOT introduced by this plan — verified by stashing my changes and re-running the guard. The mobile useStore is owned by mobile-domain plans (Phase 2 SEC/REL plans per ROADMAP). Out of scope per the parallel-execution boundary "DO NOT touch mobile/ or admin/". Logged for the orchestrator's awareness.
- **macOS `timeout` command absent:** Plan acceptance criteria included a `timeout 5 node -e "..."` smoke-test. Substituted with `setTimeout(()=>process.exit(0), 500)` inside the `node -e` script — equivalent functionality, mac-portable.

## User Setup Required

None — Sentry DSN is already declared in `backend/src/env.js` with `devDefault: ''` per plan 02. Production requires the operator to set `SENTRY_DSN` in `.env`; instrument.js silent-skips when empty (D-02). DSN provisioning happens in Phase 8 (DEPLOY) per ROADMAP.

## Next Phase Readiness

- **Wave 2 sibling plans (parallel):** 01-05 (mobile sentry) and 01-06 (admin sentry) share the same forbidden-key contract: pin/password/cardNumber/Authorization/refreshToken/Cookie. They run in their own worktrees and own their own files; no merge contention with this plan.
- **Plan 01-07 (app-error-catalog):** Will mount `errorNormalizer` after `Sentry.setupExpressErrorHandler` — Sentry sees raw error shape before downstream sanitisation. The `// PLAN 07: app.use(errorNormalizer);` placeholder is still present at the correct slot.
- **Plan 01-08 (health-routes):** Will add a dev-only `/__test__/sentry-error` endpoint to verify the wiring end-to-end (D-03 verification path). The `// PLAN 08:` placeholders are still present.
- **Plan 01-99 (phase-1 verify):** PII-Redaction Acceptance Bar can now exercise `piiBeforeSend` against real synthetic events; the helpers are exported from `backend/src/instrument.js`.

## Self-Check: PASSED

Verification of summary claims:

- `backend/src/instrument.js` — FOUND
- `backend/src/services/hpTickReporter.js` — FOUND
- `backend/tests/sentry-redaction.test.js` — FOUND
- `backend/tests/hp-tick-reporter.test.js` — FOUND
- `backend/tests/instrument-first.test.js` — FOUND
- Commit `6ce9df6` — FOUND
- Commit `4c0881a` — FOUND
- Commit `6bb4eea` — FOUND
- All 9 backend test suites pass (verified `npm test` exit 0, 65 tests + 6 todo)
- `SENTRY_DSN= node -e "require('./src/instrument')"` exit 0 — verified
- index.js line 5 is `require('./instrument');` — verified

---
*Phase: 01-observability-foundation-regression-scaffolding*
*Plan: 04*
*Completed: 2026-04-25*
