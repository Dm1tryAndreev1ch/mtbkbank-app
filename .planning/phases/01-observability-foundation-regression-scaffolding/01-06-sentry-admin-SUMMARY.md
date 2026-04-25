---
phase: 01-observability-foundation-regression-scaffolding
plan: 06
subsystem: observability
tags: [sentry, admin, vite, observability, pii-redaction]
requirements: [OBS-04]
dependency_graph:
  requires:
    - 01-00-regression-scaffolding (regression-guard.sh pins admin invariants)
  provides:
    - Admin Sentry SDK wired with PII-redacting beforeSend (parity with backend/mobile)
    - sentryVitePlugin gated on three CI secrets, build-resilient via errorHandler
    - Sentry.ErrorBoundary wraps <App /> with Russian fallback
    - admin/vitest.config.js (jsdom env) — first vitest config for admin
    - 20-test vitest suite (14 redaction + 6 init) pinning the parity contract
  affects:
    - admin/src/App.jsx (added Sentry import + DEV-only test button — does NOT touch tokenRef or empty try/catch)
    - admin/src/main.jsx (rewrote to side-effect-import './sentry' as line 1; ErrorBoundary wrap)
    - admin/vite.config.js (added sentryVitePlugin gating, build.sourcemap=true)
tech_stack:
  added:
    - "@sentry/react@^10.0.0 (dependency)"
    - "@sentry/vite-plugin@^5.0.0 (devDependency)"
    - "vitest@^1.6.0 (devDependency)"
    - "jsdom@^25.0.0 (devDependency)"
  patterns:
    - "Vite SPA Sentry init via side-effect import as line 1 of main.jsx (init runs before ReactDOM.render)"
    - "Three-secret gate (mode === 'production' && SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT) on sentryVitePlugin"
    - "errorHandler callback that demotes upload failures to console.warn — build NEVER fails on Sentry hiccup"
    - "Sentry.ErrorBoundary fallback render-prop with Russian copy ('Произошла ошибка' + 'Код для поддержки: {eventId}')"
    - "{import.meta.env.DEV && <DevButton/>} dead-code-elim pattern — Vite tree-shakes the dev branch out of the production .js bundle"
    - "vi.mock('@sentry/react') + vi.stubEnv('VITE_SENTRY_DSN', ...) + vi.resetModules() pattern for testing module-load-time Sentry.init guards"
key_files:
  created:
    - admin/src/sentry.js
    - admin/vitest.config.js
    - admin/src/__tests__/sentry-redaction.test.js
    - admin/src/__tests__/sentry-init.test.js
  modified:
    - admin/package.json
    - admin/package-lock.json
    - admin/.env.example
    - admin/src/main.jsx
    - admin/vite.config.js
    - admin/src/App.jsx
decisions:
  - "Order scrubString regexes JWT → card-digit → key=value with negative lookahead `(?!\\[REDACTED)` so the generic key=value pass does not clobber prior `[REDACTED_JWT]` / `[REDACTED_CARD]` tags. Prevents a Rule-1 regression on the breadcrumbs-message redaction test where `cardNumber=4111111111111111` was being collapsed to `cardNumber=[REDACTED]` instead of `cardNumber=[REDACTED_CARD]`."
  - "Build-resilient sentryVitePlugin gating uses an `errorHandler: (err) => console.warn(...)` callback rather than try/catch around plugin push, because the plugin throws asynchronously inside Vite's plugin pipeline. Verified by `SENTRY_AUTH_TOKEN= npx vite build` exiting 0 (plugin not pushed when token empty)."
  - "Test suite mocks `@sentry/react` exports (`init`, `captureException`, `setUser`, `ErrorBoundary`) to prevent real Sentry network init during test-load. The mock plus `vi.stubEnv('VITE_SENTRY_DSN', ...) + vi.resetModules()` lets the same suite test both the DSN-set init path AND the DSN-empty silent-skip guard."
metrics:
  duration: 4m56s
  tasks_completed: 3
  files_created: 4
  files_modified: 6
  tests_added: 20
  completed: 2026-04-25
---

# Phase 01 Plan 06: Sentry Admin Setup Summary

`@sentry/react@10` wired into the admin Vite SPA via side-effect import in `main.jsx` with a Russian-copy `Sentry.ErrorBoundary` wrap, PII-redacting `piiBeforeSend` parity with backend/mobile (14-case vitest suite), and a build-resilient `@sentry/vite-plugin@5` gated on three CI secrets with a console-warn errorHandler so admin deploys never break on Sentry hiccups.

## What Was Built

**Three Sentry surfaces in admin/, runtime + build + test:**

1. **Runtime SDK init (`admin/src/sentry.js`):** Side-effect module that calls `Sentry.init({...})` only when `import.meta.env.VITE_SENTRY_DSN` is non-empty. Locks D-04 sampling — `tracesSampleRate: 0.1` in production, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0` (admin has NO replay; replay is mobile-only). `beforeSend: piiBeforeSend` covers all 7 event paths (`request.data` / `request.headers` / `request.cookies` / `request.query_string` / `contexts.*` / `exception.values[].value+stacktrace.frames[].vars` / `breadcrumbs[].data+message` / `extra` / `message`) plus `user → { id }` reset for PII parity with `backend/src/sentry.js` and `mobile/sentry.js`.

2. **ErrorBoundary in `admin/src/main.jsx`:** `import './sentry'` is line 1 (with `// eslint-disable-next-line import/first` hint), then `import * as Sentry from '@sentry/react'`. The render tree wraps `<App />` in `<Sentry.ErrorBoundary fallback={({ eventId }) => (<div>...<h2>Произошла ошибка</h2><p>Код для поддержки: {eventId}</p></div>)}>`. The existing `try { localStorage.getItem('admin_theme') ... } catch { /* ignore */ }` block is preserved verbatim — Phase-2 anti-pattern site, explicitly allowlisted by PATTERNS doc and pinned by `scripts/regression-guard.sh`.

3. **Build plugin in `admin/vite.config.js`:** `sentryVitePlugin` gated on `mode === 'production' && env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT`. The plugin's `errorHandler: (err) => console.warn('[sentry-vite-plugin] sourcemap upload failed (build continues):', err.message)` callback demotes upload failures to a warning. `build.sourcemap: true` enables sourcemap emission for upload. The existing `loadEnv` + `proxyTarget` + `/api` proxy idiom is preserved verbatim.

**Plus the verification surface:**
- `admin/vitest.config.js`: `defineConfig({ test: { environment: 'jsdom', globals: true, include: ['src/__tests__/**/*.test.{js,jsx}'] } })` — first vitest config for the admin module.
- `admin/src/__tests__/sentry-redaction.test.js`: 14 tests — request paths × 3, contexts/extra/user × 3, exception+breadcrumbs × 4, message × 2, scrubObject case+depth × 2.
- `admin/src/__tests__/sentry-init.test.js`: 6 tests — DSN passthrough, replay rates = 0, tracesSampleRate type, beforeSend wired, DSN-empty silent skip.
- `admin/src/App.jsx`: `{import.meta.env.DEV && <button data-testid="sentry-test-button" onClick={() => Sentry.captureException(new Error('Phase-1 Sentry test (admin)'))}>Throw test error (DEV)</button>}` mounted in the dashboard scroll area for D-03 manual verification.
- `admin/.env.example`: `VITE_SENTRY_DSN=` (browser-exposed key, blank default) + a Russian comment block documenting the three CI-only secrets (commented out so they document intent without becoming a real KEY=).

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Redaction parity (14 tests) | `cd admin && npx vitest run sentry-redaction` | ✓ 14/14 passed (264ms after fix; 256ms in steady state) |
| Init wiring (6 tests) | `cd admin && npx vitest run sentry-init` | ✓ 6/6 passed |
| Full admin suite | `cd admin && npx vitest run` | ✓ 20/20 passed |
| Build smoke (no Sentry token) | `cd admin && SENTRY_AUTH_TOKEN= npx vite build` | ✓ exit 0; "337 modules transformed; ✓ built in 567ms" |
| Tree-shake (prod JS bundle) | `grep -c 'sentry-test-button' admin/dist/assets/*.js` | ✓ 0 matches in `.js` (dev branch eliminated from served code) |
| Sourcemap presence | `ls admin/dist/assets/*.map` | ✓ 1 file present (intentional — sourcemap is the upload surface) |
| Static admin invariants | `bash scripts/regression-guard.sh` (admin section) | ✓ "OK Admin module-scope let TOKEN" — admin uses `tokenRef`, no regression introduced |

### Note on the tree-shake assertion

The plan's acceptance criterion `grep -r 'sentry-test-button' admin/dist/assets/` returned `1` because the **sourcemap file** (`admin/dist/assets/index-*.js.map`) preserves the original-source string by design. The shipped JS bundle (`admin/dist/assets/index-*.js`) returns `0` matches — Vite correctly tree-shook the `import.meta.env.DEV && ...` branch out of the production code. Sourcemaps are intentional for the Sentry sourcemap-upload contract (`build.sourcemap: true` is required by the plan). The functional invariant ("DEV branch is dead code in served bundle") is satisfied; the criterion grep was over-broad on file scope. Recorded here so the verifier does not flag the sourcemap match as a regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scrubString regex order clobbered prior redaction tags**

- **Found during:** Task 1 — `npx vitest run sentry-redaction` red on `scrubs breadcrumbs[].message via scrubString`
- **Issue:** With the plan's original regex order (key=value first, then card-digit, then JWT), input `'token=eyJabc.def.ghi cardNumber=4111111111111111'` produced `'token=eyJabc.def.ghi cardNumber=[REDACTED]'` — the key=value pass swallowed the 16 digits before the card-digit regex could tag them as `[REDACTED_CARD]`. Reordering alone (JWT → card-digit → key=value) was insufficient because the third regex's `[^"',}\s]+` value class then ate the literal `[REDACTED_CARD]` tag and overwrote it with `[REDACTED]`.
- **Fix:** Two-part change inside `scrubString`:
  1. Run JWT regex first (pre-empts the card-digit catch-all), then card-digit, then key=value.
  2. Add a negative lookahead `(?!\[REDACTED)` to the key=value regex so it skips values that the prior passes already tagged. Inline comment explains the ordering invariant for future editors.
- **Files modified:** `admin/src/sentry.js`
- **Commit:** Fixed inline within Task 1 commit (`498a3e6`) — fix authored before the test commit was finalized so the suite was green at commit time.

**Note:** This regex-ordering bug also exists conceptually in the parity-target backend/mobile suites if they followed the same plan-default ordering — the verifier or Phase-1 cross-plan reconciliation should check `backend/src/sentry.js` and `mobile/sentry.js` for the same pattern. Not modified here because they are owned by parallel plans 01-04 and 01-05 (scope-boundary rule).

### Ask-About Items

None.

## Authentication Gates

None encountered — admin Sentry DSN is browser-exposed (`VITE_SENTRY_DSN`); the three CI-only secrets are documented but never required for build (errorHandler/gating ensures graceful degradation).

## Self-Check: PASSED

- Files created (verified):
  - `admin/src/sentry.js` — FOUND
  - `admin/vitest.config.js` — FOUND
  - `admin/src/__tests__/sentry-redaction.test.js` — FOUND
  - `admin/src/__tests__/sentry-init.test.js` — FOUND
- Files modified (verified):
  - `admin/package.json` — `@sentry/react`, `@sentry/vite-plugin`, `vitest`, `jsdom` present
  - `admin/.env.example` — `VITE_SENTRY_DSN=` + commented `# SENTRY_AUTH_TOKEN` block present
  - `admin/src/main.jsx` — line 3 is `import './sentry';`; `Sentry.ErrorBoundary`, `Произошла ошибка`, `Код для поддержки` all present
  - `admin/vite.config.js` — `sentryVitePlugin`, three-secret gate, `errorHandler:`, `build: { sourcemap: true }` all present
  - `admin/src/App.jsx` — `import * as Sentry from '@sentry/react'`, `import.meta.env.DEV`, `data-testid="sentry-test-button"` all present
- Commits (verified via `git log --oneline`):
  - `498a3e6` test(01-06): add Sentry admin redaction suite + scrub helpers — FOUND
  - `22395cb` feat(01-06): wire Sentry side-effect import + ErrorBoundary in admin/main.jsx — FOUND
  - `33f2623` feat(01-06): add sentryVitePlugin gating + DEV-only Sentry test button — FOUND
- Out-of-scope invariants left untouched:
  - admin `let TOKEN` regression-pin: ✓ admin uses `tokenRef` (no `let TOKEN`); regression-guard reports "OK Admin module-scope let TOKEN" — Phase-2 SEC-06 still owns any token-storage refactor
  - admin empty try/catch sites in `App.jsx` and `main.jsx`: preserved verbatim — Phase 2/3 own those fixes
  - backend/ and mobile/ untouched: ✓ all changes scoped to `admin/` + the SUMMARY.md path (parallel plans 01-04 and 01-05 own those modules)
