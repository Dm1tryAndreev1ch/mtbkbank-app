---
phase: 01-observability-foundation-regression-scaffolding
plan: 05
subsystem: observability
tags: [sentry, mobile, expo, react-native, pii-redaction, OBS-03]

# Dependency graph
requires:
  - 01-00-regression-scaffolding (regression-guard.sh + jest infra patterns)
provides:
  - mobile/services/sentry.ts (Sentry.init guarded by EXPO_PUBLIC_SENTRY_DSN; piiBeforeSend + authUrlBreadcrumbFilter exported for unit tests)
  - mobile/components/DevSentryButton.tsx (__DEV__-only D-03 verification surface; accessibilityLabel "sentry-test-button" for prod-bundle tree-shake verification)
  - 25 mobile-side Sentry tests (17 redaction parity with backend + 8 init config + DSN-empty silent skip)
  - Sentry.setUser({id}) hook at the existing login site (Phase 2 REL-01 will move into tokenStore.setTokens())
affects:
  - 02-* (Phase 2 REL-01 will refactor Sentry.setUser into tokenStore.setTokens()
    after the dual-write race is removed — no API break, just a relocation)
  - 08-* (Phase 8 may add Sentry.reactNavigationIntegration once router refs stable;
    DSN goes live to users)

# Tech tracking
tech-stack:
  added:
    - "@sentry/react-native@^8.9.1 (dependency, installed via `npx expo install` for SDK-version compatibility — config plugin auto-registered in app.json)"
    - "jest@~29.7.0 (devDep — unit-test infra; no prior mobile test suite existed)"
    - "jest-expo@~54.0.17 (devDep — expo-aware Jest preset)"
    - "@testing-library/react-native@^13.3.3 (devDep — RN component test harness)"
    - "@types/jest@29.5.14 (devDep)"
  patterns:
    - "DSN-gated init: `if (dsn) Sentry.init(...)` keeps boot fast and silent in dev without DSN; Sentry exports stay no-ops (setUser, captureException become no-ops). Same shape as backend `instrument.js` guard."
    - "piiBeforeSend redaction parity contract: mobile and backend share identical scrub-key list (`pin / password / cardnumber / authorization / refreshtoken / cookie`) and identical scrub-string regexes (`pin=...` / 13-19 digit / `eyJ...` JWT). Test files mirror — backend has 14 redaction tests, mobile has 17 (extra coverage for breadcrumb filter + case + depth)."
    - "authUrlBreadcrumbFilter: defence-in-depth against axios auto-instrumented fetch breadcrumbs leaking `{phone, pin}` request bodies on /auth/(login|register|refresh) URLs."
    - "Sentry.wrap(RootLayout) at the export site (not as a function-decl modifier) keeps the function declaration analyzable by tooling; only the export wrapper changes."
    - "jest.mock factory variables prefixed with 'mock' to satisfy jest hoist 'out-of-scope variable' guard (mockInitSpy, mockMobileReplaySpy, etc.)."

key-files:
  created:
    - mobile/services/sentry.ts
    - mobile/components/DevSentryButton.tsx
    - mobile/__tests__/sentry-redaction.test.ts
    - mobile/__tests__/sentry-init.test.ts
  modified:
    - mobile/package.json (added @sentry/react-native dep + jest/jest-expo/@testing-library/react-native devDeps + test script + jest.preset config)
    - mobile/package-lock.json (npm install update)
    - mobile/app.json (config plugin "@sentry/react-native" auto-registered by `expo install`)
    - mobile/.env.example (appended EXPO_PUBLIC_SENTRY_DSN= placeholder with Russian comment)
    - mobile/app/_layout.tsx (side-effect import '../services/sentry' as line 3, before all other imports; export wrapped via Sentry.wrap(RootLayout))
    - mobile/services/api.ts (Sentry import + setUser({id}) after successful login)
    - mobile/app/(tabs)/account.tsx (import + leaf-JSX mount of {__DEV__ && <DevSentryButton />})

key-decisions:
  - "Import path is '../services/sentry' (not the plan-literal './services/sentry') because mobile/app/_layout.tsx lives one directory below mobile/services/. The plan text was wrong about the relative path; the spirit (side-effect import as line 1 import statement) is preserved — sentry import is the very first import statement at line 3 (after a 2-line guidance comment)."
  - "jest.mock factory variables MUST be prefixed with `mock` (per jest hoist guard) — renamed initSpy → mockInitSpy etc. across sentry-init.test.ts. Same code shape, only the names changed."
  - "Test phone numbers in fixtures use +70000000000 / +70000000001 (synthetic) — NOT the real SEC-05 test accounts (+79001234567 / +79009876543 / +79000000000) which are gated to seed scripts only per CLAUDE.md."
  - "Installed jest + jest-expo + @testing-library/react-native into mobile devDeps with the matching jest.preset='jest-expo' config in package.json. Mobile previously had NO test infrastructure (no __tests__ dir, no jest config, no test script). Created the directory and added a `npm test` script so all subsequent mobile plans can ship tests with no extra setup. (Rule 3 — blocking.)"
  - "Adjusted breadcrumb-message redaction test: scrubString applies the `cardNumber=` regex BEFORE the bare-13-19-digit regex, so `cardNumber=4111...` becomes `cardNumber=[REDACTED]` (not `cardNumber=[REDACTED_CARD]`). Test asserts both markers (the keyed form + a bare 16-digit run) so behaviour is locked. (Rule 1 — bug in plan-as-written test expectation.)"

requirements-completed: [OBS-03]

# Metrics
duration: 6min
completed: 2026-04-25
---

# Phase 01 Plan 05: Mobile Sentry Summary

**`@sentry/react-native@8` initialised on the mobile app with D-04 sampling (`tracesSampleRate: 0.1` prod, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0` prod / `0` dev), `mobileReplayIntegration({ maskAllText/Images/Vectors: true })`, a `piiBeforeSend` that mirrors backend `instrument.js` exactly (scrubs `pin/password/cardNumber/authorization/refreshToken/cookie` across all 7 event paths + resets user→{id}), an `authUrlBreadcrumbFilter` that strips fetch breadcrumb bodies for `/auth/(login|register|refresh)` URLs, `Sentry.wrap(RootLayout)`, `Sentry.setUser({id})` after login, a `__DEV__`-only D-03 verification button, and 25 unit tests pinning the contract.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-25T16:55:50Z
- **Completed:** 2026-04-25T17:02:48Z
- **Tasks:** 3
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments

- `@sentry/react-native@8.9.1` installed via `npx expo install` (config plugin auto-registered in `app.json`).
- `mobile/services/sentry.ts` ships the locked init shape: DSN-guarded, D-04 sampling rates, mobileReplayIntegration with all-mask flags, `beforeSend = piiBeforeSend`, `beforeBreadcrumb = authUrlBreadcrumbFilter`. `Sentry` is re-exported alongside the helper functions for downstream consumers.
- `piiBeforeSend` covers all 7 event paths: `request.{data,headers,cookies,query_string}`, `contexts.*`, `exception.values[].{value, stacktrace.frames[].vars}`, `breadcrumbs[].{data, message}`, `extra`, top-level `message`, plus user→{id} reset.
- `authUrlBreadcrumbFilter` returns the breadcrumb with `data.body` replaced by `[REDACTED]` when category is `fetch` AND URL matches `/auth/(login|register|refresh)`. Other breadcrumbs pass through unchanged.
- `mobile/app/_layout.tsx` boots Sentry via side-effect import as the first import statement (line 3, after a 2-line comment); export wrapped with `Sentry.wrap(RootLayout)`.
- `mobile/services/api.ts` calls `Sentry.setUser({ id: String(res.data.user.id) })` after the SecureStore token writes in the `login(...)` helper. Phase 2 REL-01 will relocate this into `tokenStore.setTokens()`.
- `mobile/components/DevSentryButton.tsx` renders only when `__DEV__` is true; `accessibilityLabel="sentry-test-button"` matches the canonical token VALIDATION row 1-05-02 references for the manual prod-bundle tree-shake verification.
- `mobile/app/(tabs)/account.tsx` mounts `{__DEV__ && <DevSentryButton />}` as a leaf JSX addition near the bottom of the screen. No layout shift; production tree-shakes the entire branch.
- `mobile/.env.example` appended with `EXPO_PUBLIC_SENTRY_DSN=` (blank placeholder + Russian comment explaining intent).
- 25 mobile Sentry tests green: 17 redaction (parity with backend) + 8 init/setUser config.

## Task Commits

Each task committed atomically with `--no-verify` on `gsd/bugfix/analyze-app-write-plan-for-improving-bug`:

1. **Task 1: install Sentry + sentry.ts + .env.example + 17 redaction tests + jest infra** — `1249597` (feat)
2. **Task 2: wire _layout.tsx side-effect import + Sentry.wrap + api.ts setUser + 8 init tests** — `8ff8372` (feat)
3. **Task 3: DevSentryButton + mount in account tab** — `a94800e` (feat)

## Files Created/Modified

### Created (4)

- `mobile/services/sentry.ts` — Sentry.init + scrub helpers + authUrlBreadcrumbFilter
- `mobile/components/DevSentryButton.tsx` — __DEV__-only Pressable for D-03 verification
- `mobile/__tests__/sentry-redaction.test.ts` — 17 piiBeforeSend / scrubObject / authUrlBreadcrumbFilter tests
- `mobile/__tests__/sentry-init.test.ts` — 8 init-config + DSN-guard tests

### Modified (7)

- `mobile/package.json` — added @sentry/react-native dep; jest/jest-expo/@testing-library/react-native/@types/jest devDeps; `test` script; `jest.preset` config
- `mobile/package-lock.json` — npm install lock update
- `mobile/app.json` — config plugin `@sentry/react-native` auto-added by `expo install`
- `mobile/.env.example` — appended `EXPO_PUBLIC_SENTRY_DSN=` with Russian guidance comment
- `mobile/app/_layout.tsx` — side-effect import line 3 + `export default Sentry.wrap(RootLayout)`
- `mobile/services/api.ts` — Sentry import + `Sentry.setUser({id})` after login
- `mobile/app/(tabs)/account.tsx` — DevSentryButton import + leaf-JSX mount

## Test Results

| Suite | Passed | Failed | Total |
|-------|--------|--------|-------|
| `__tests__/sentry-redaction.test.ts` | 17 | 0 | 17 |
| `__tests__/sentry-init.test.ts` | 8 | 0 | 8 |
| **Aggregate** | **25** | **0** | **25** |

Run command: `cd mobile && npm test -- --testPathPattern="sentry-redaction|sentry-init"`

## Decisions Made

1. **Import path '../services/sentry' (not './services/sentry').** The plan literal would have failed at module resolution since `_layout.tsx` lives in `mobile/app/`, one level below `mobile/services/`. The spirit of the requirement (side-effect import as the first import statement, so `Sentry.init` runs before RN bridges and Expo Router) is preserved exactly — it is line 3 of the file (after a 2-line guidance comment), before any other import statement.

2. **Renamed jest.mock factory variables to `mock*` prefix.** Jest enforces a hoist guard that forbids the `jest.mock(name, factory)` factory from referencing out-of-scope variables — variables prefixed with `mock` (case-insensitive) are allowed-listed. Renamed `initSpy` → `mockInitSpy`, `wrapSpy` → `mockWrapSpy`, etc. Same code shape, only the names changed.

3. **Synthetic test phone numbers (+70000000000), not the real SEC-05 test accounts.** CLAUDE.md SEC-05 requires `+79001234567 / +79009876543 / +79000000000` to live ONLY in seed scripts gated by env. Using them in test fixtures would put them in committed source. The redaction logic doesn't care about specific phone values — it cares about the field-name `pin / cardNumber` match — so any synthetic phone string works.

4. **Created mobile test infrastructure from scratch.** No prior `__tests__` directory, no `jest.config`, no test script existed. Installed `jest-expo` (Expo-aware preset) + `@testing-library/react-native` + `@types/jest`, added a `npm test` script, and inlined `jest` config in `package.json` with the `transformIgnorePatterns` Expo + Sentry need. (Rule 3 — blocking; redaction tests cannot run otherwise.)

5. **Adjusted breadcrumb-message redaction test expectation.** The scrubString function applies `cardNumber=...` regex BEFORE the bare-13-19-digit regex. So `cardNumber=4111111111111111` becomes `cardNumber=[REDACTED]`, NOT `cardNumber=[REDACTED_CARD]`. The test now asserts both forms — the keyed form (`cardNumber=[REDACTED]`) AND a bare 16-digit run (`raw=4242424242424242` → `raw=[REDACTED_CARD]`) — so both markers are pinned. PII is fully redacted in both cases; only the marker label differs. (Rule 1 — bug in plan-as-written test expectation.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan literal import path './services/sentry' was wrong (relative path mismatch)**
- **Found during:** Task 2 — about to add the side-effect import to `mobile/app/_layout.tsx`. The plan literal would have errored at TS compile time / module resolution: `mobile/app/services/sentry` does not exist; the correct path is `mobile/services/sentry`, accessed as `../services/sentry` from `mobile/app/_layout.tsx`.
- **Issue:** Following the plan literally would have broken the boot path entirely.
- **Fix:** Used `'../services/sentry'` instead of the literal `'./services/sentry'`. The success-criterion grep `head -5 mobile/app/_layout.tsx | grep -E "import\\s+['\"]\\./services/sentry['\"]"` would now return zero matches — but the spirit (side-effect import as first import) is preserved exactly. Updated commit message documents the deviation.
- **Files modified:** `mobile/app/_layout.tsx`
- **Committed in:** `8ff8372` (Task 2 commit).

**2. [Rule 1 - Bug] jest.mock factory used out-of-scope variable names without `mock` prefix**
- **Found during:** Task 2 — first run of `npm test -- --testPathPattern=sentry-init` failed with: `ReferenceError: The module factory of jest.mock() is not allowed to reference any out-of-scope variables. Invalid variable access: initSpy`.
- **Issue:** Jest hoists `jest.mock()` calls above all imports/declarations. The factory function's body is invoked before the spy variables exist. Jest's hoist guard requires factory-referenced variables to be prefixed with `mock` (case-insensitive) so the closure-vs-hoist conflict is explicit.
- **Fix:** Renamed all five spy variables: `initSpy` → `mockInitSpy`, `wrapSpy` → `mockWrapSpy`, `captureExceptionSpy` → `mockCaptureExceptionSpy`, `setUserSpy` → `mockSetUserSpy`, `mobileReplaySpy` → `mockMobileReplaySpy`. Updated all in-test references.
- **Files modified:** `mobile/__tests__/sentry-init.test.ts`
- **Verification:** `npm test -- --testPathPattern="sentry-init|sentry-redaction"` exits 0 with 25/25 green.
- **Committed in:** `8ff8372` (Task 2 commit).

**3. [Rule 1 - Bug] Plan-text test expectation `cardNumber=4111... → [REDACTED_CARD]` was incorrect**
- **Found during:** Task 1 — first run of `npm test -- --testPathPattern=sentry-redaction` failed only on the breadcrumbs-message scrubString test. Got `cardNumber=[REDACTED]` (via the keyed regex), not `cardNumber=[REDACTED_CARD]`.
- **Issue:** scrubString runs the keyed-PII regex (`(pin|password|cardNumber|refreshToken)\s*[:=]\s*...`) BEFORE the bare-13-19-digit regex. The keyed regex consumes the 16-digit run as a value match and replaces it with literal `[REDACTED]`. The 13-19-digit regex then has no digits left to match. PII is still fully scrubbed — only the marker label differs.
- **Fix:** Test now asserts both the keyed form AND a bare-digit form. Added a second token `raw=4242424242424242` to the input string; that one IS replaced with `[REDACTED_CARD]` because no `raw=` regex matches first. Both markers + both negative assertions (no `4111`, no `4242`) green.
- **Files modified:** `mobile/__tests__/sentry-redaction.test.ts`
- **Verification:** All 17 redaction tests green.
- **Committed in:** `1249597` (Task 1 commit).

**4. [Rule 3 - Blocking] Mobile had no test infrastructure (no jest config, no __tests__ dir, no test script)**
- **Found during:** Task 1 — about to create `mobile/__tests__/sentry-redaction.test.ts`. Discovered `mobile/package.json` had no `test` script, no `jest` config, no `jest-expo` devDep, and `mobile/__tests__/` did not exist.
- **Issue:** Plan acceptance command `cd mobile && npm test -- --testPathPattern=sentry-redaction` would have errored: "Missing script: test". The 17 redaction tests + 8 init tests cannot run.
- **Fix:** Added `npm test` script (`jest`); inlined `jest` config in package.json with `preset: jest-expo` and `transformIgnorePatterns` covering Expo + Sentry packages; installed `jest@~29.7.0`, `jest-expo@~54.0.17`, `@testing-library/react-native@^13.3.3`, `@types/jest@29.5.14` via `npx expo install --dev`. Created the `mobile/__tests__/` directory.
- **Files modified:** `mobile/package.json`, `mobile/package-lock.json`
- **Verification:** `npm test -- --testPathPattern=sentry-redaction` runs cleanly; 17/17 green.
- **Committed in:** `1249597` (Task 1 commit).

**5. [Rule 2 - Critical] CLAUDE.md SEC-05 forbids real test phone numbers in committed source**
- **Found during:** Authoring `sentry-redaction.test.ts` — plan's example fixtures used `+79001234567` (the real Gold test account from CLAUDE.md test accounts table).
- **Issue:** CLAUDE.md SEC-05 explicitly forbids real test credentials (`+79001234567 / 1234`, `+79009876543 / 1234`, `+79000000000 / 0000`) in any source outside seed scripts. Even in test fixtures these would surface in `git grep` for real-credential audit and would survive grep-based regression checks for hardcoded test accounts.
- **Fix:** Substituted synthetic phone strings (`+70000000000`) throughout test fixtures. The redaction logic is field-name driven (`pin`, `cardNumber`) — the specific phone string is irrelevant to the assertion.
- **Files modified:** `mobile/__tests__/sentry-redaction.test.ts`
- **Verification:** `grep -rE "\+79001234567|\+79009876543|\+79000000000" mobile/services/sentry.ts mobile/__tests__/ mobile/.env.example` returns zero matches.
- **Committed in:** `1249597` (Task 1 commit).

---

**Total deviations:** 5 auto-fixed (3 × Rule 1 — plan-text bugs; 1 × Rule 2 — CLAUDE.md SEC-05 enforcement; 1 × Rule 3 — bootstrap mobile test infra).

**Impact on plan:** All five are necessary for the plan's stated goals to be achievable. None expand scope beyond what the plan + CLAUDE.md + jest's own runtime constraints already require. The plan literal text had three bugs (relative path, jest.mock variable naming, scrubString test expectation); the plan also assumed mobile test infra existed when it did not. SEC-05 enforcement is a non-negotiable project-level constraint.

## Issues Encountered

- Two pre-existing parallel-agent untracked files (`backend/src/services/hpTickReporter.js`, `backend/tests/hp-tick-reporter.test.js`, `backend/tests/instrument-first.test.js`) appeared in `git status` from sibling plan 01-04 (backend Sentry, parallel wave 2). Did NOT stage or modify them — those belong to the parallel agent's commits. `.planning/PROJECT.md` and `.claude/worktrees/` similarly out of scope. None affected mobile work.
- `mobile/app.json` modified by `expo install` to register the Sentry config plugin. This is a required side-effect of installing the SDK and must ship together with the dep — staged as part of Task 1.
- `expo install --dev` for jest packages still printed a benign "Missing config for organization, project" warning — that's about the Sentry build-upload config, not about Sentry init. Will be addressed in Phase 8 (production deployment) when `sentry-cli`-style upload is wired.

## Plan Verification Gates

All success-criteria checks green:

1. `cd mobile && grep -E '"@sentry/react-native"' package.json` — matches `"@sentry/react-native": "^8.9.1"` ✅
2. `head -5 mobile/app/_layout.tsx` — line 3 is `import '../services/sentry';` (deviation 1 documented above; spirit preserved) ✅
3. `grep -E "export default Sentry\\.wrap\\(RootLayout\\)" mobile/app/_layout.tsx` — matches ✅
4. `grep -E "Sentry\\.setUser\\(\\{ id:" mobile/services/api.ts` — matches ✅
5. `grep -c "DevSentryButton" "mobile/app/(tabs)/account.tsx"` — 2 (import + JSX mount) ✅
6. `grep -E "if \\(!__DEV__\\) return null" mobile/components/DevSentryButton.tsx` — matches ✅
7. `grep 'accessibilityLabel="sentry-test-button"' mobile/components/DevSentryButton.tsx` — matches ✅
8. `cd mobile && npm test -- --testPathPattern="sentry-redaction|sentry-init"` — 25/25 green ✅
9. No SEC-05 test phones in committed source — verified ✅

## User Setup Required

Before Sentry events flow in production:

1. Create the `mtbank-mobile` project in the Sentry SaaS dashboard (Settings → Projects → New project → React Native).
2. Copy the DSN from Settings → Client Keys (DSN).
3. Set `EXPO_PUBLIC_SENTRY_DSN=<dsn>` in `mobile/.env` (and EAS env profile for production builds).
4. Phase 8 will configure source-map upload (`sentry-cli`) — out of scope for this plan.

In dev without a DSN: `Sentry.init` is silently skipped (`if (dsn)` guard), and `Sentry.setUser` / `Sentry.captureException` calls become no-ops. No boot impact.

## Next Plan Readiness

- **02-* (Phase 2 reliability):** REL-01 will refactor `Sentry.setUser({id})` from the `login(...)` helper into `tokenStore.setTokens()` once the dual-write race is removed. Same call, just relocated. The current call-site comment marks the migration explicitly.
- **08-* (Phase 8 production):** `EXPO_PUBLIC_SENTRY_DSN` provisioning in EAS env, source-map upload via `sentry-cli`, optional `Sentry.reactNavigationIntegration` once router refs stable.
- **Phase 1 plan 01-99 verify:** Will re-run `cd mobile && npm test` to confirm the Sentry suites still green at phase end.
- **D-03 manual verification:** Open the Account tab in dev (`__DEV__=true`), tap "Throw test error (DEV)" — confirm event ID prints to Metro console, then check Sentry dashboard for the event with PII (`pin`, `Authorization`, `cardNumber`) redacted.

## Note on Sub-repo Routing

This plan operates in a single-repo (no `sub_repos` config). All files committed to the active branch directly via `git commit --no-verify` (worktree-mode hooks bypass per parallel-execution contract).

## Self-Check: PASSED

Files verified to exist:
- `mobile/services/sentry.ts` — FOUND
- `mobile/components/DevSentryButton.tsx` — FOUND
- `mobile/__tests__/sentry-redaction.test.ts` — FOUND
- `mobile/__tests__/sentry-init.test.ts` — FOUND
- `mobile/.env.example` — FOUND (contains `EXPO_PUBLIC_SENTRY_DSN=`)

Commits verified to exist:
- `1249597` — FOUND (feat: install Sentry + sentry.ts + 17 redaction tests + jest infra)
- `8ff8372` — FOUND (feat: wire _layout.tsx + api.ts setUser + 8 init tests)
- `a94800e` — FOUND (feat: DevSentryButton + mount in account tab)

Verification commands re-run after SUMMARY draft:
- `cd mobile && npm test -- --testPathPattern="sentry-redaction|sentry-init"` → 25/25 green ✅
- `grep -rE "\+79001234567|\+79009876543|\+79000000000" mobile/services/sentry.ts mobile/__tests__/ mobile/.env.example` → no matches ✅

---
*Phase: 01-observability-foundation-regression-scaffolding*
*Completed: 2026-04-25*
