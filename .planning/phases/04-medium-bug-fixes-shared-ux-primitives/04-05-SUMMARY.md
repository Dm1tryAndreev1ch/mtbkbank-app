---
phase: 04-medium-bug-fixes-shared-ux-primitives
plan: 05
subsystem: regression-scaffolding
tags: [eslint, regression-guard, mockup-buttons, AppAlert-removal, UX-04, TEST-05]
requires:
  - mobile/components/ActionButton.tsx (plan 04-01)
  - mobile/components/Toast.tsx (plan 04-01)
  - mobile/components/ConfirmDialog.tsx (plan 04-01)
provides:
  - scripts/audit-mockup-buttons.sh (developer audit tool)
  - mobile/eslint.config.js Phase-4 D-08 selectors (lint hard-gate)
  - scripts/regression-guard.sh Phase-4 block (CI hard-gate)
  - mobile/components/AppAlert.tsx (DELETED — final closure)
affects:
  - mobile/app/(tabs)/cards.tsx (raw async TouchableOpacity → ActionButton)
  - mobile/app/payment.tsx (dead AppAlert/useAppAlert removal)
  - admin/src/App.jsx (Phase-2 SEC-05 placeholder regression scrub)
tech-stack:
  added: []
  patterns: [ESLint flat-config no-restricted-syntax, multiline PCRE git grep -znP]
key-files:
  created:
    - scripts/audit-mockup-buttons.sh
    - mobile/eslint-rules/__tests__/no-raw-mutation-button.test.js
  deleted:
    - mobile/components/AppAlert.tsx
    - mobile/hooks/useAppAlert.ts
  modified:
    - mobile/app/(tabs)/cards.tsx
    - mobile/app/payment.tsx
    - mobile/eslint.config.js
    - scripts/regression-guard.sh
    - admin/src/App.jsx
decisions:
  - ESLint rule via no-restricted-syntax selectors (not custom rule). Three selectors fit cleanly in flat config; AST query :not([name.name='ActionButton']) carves out the wrapper.
  - Audit/regression-guard regex for raw async onPress restricted to <TouchableOpacity|Pressable> tags via multiline PCRE (git grep -znP). This makes ActionButton with async onPress legitimately allowed while still catching raw use.
  - Test runs ESLint via spawnSync CLI rather than ESLint Node API. Reason: jest-expo CJS VM cannot dynamic-import flat config (TypeError: A dynamic import callback was invoked without --experimental-vm-modules).
  - admin/src/App.jsx login placeholder '+79001234567' replaced with '+7XXXXXXXXXX' (Rule 1 — pre-existing Phase-2 SEC-05 regression that blocked regression-guard).
metrics:
  completed: 2026-04-26
  tasks: 3
  commits: 3
  duration: ~25 min
---

# Phase 4 Plan 5: Mockup-Button Audit + ESLint D-08 + AppAlert Removal Summary

Final guard plan: closes the mockup-button audit (D-07), enables an ESLint hard-gate blocking raw async TouchableOpacity onPress and empty onPress patterns (D-08), extends `regression-guard.sh` with 6 Phase-4 gates, and deletes `mobile/components/AppAlert.tsx` plus its `useAppAlert` hook now that all consumers are migrated to Toast/ConfirmDialog.

## What Shipped

### Task 1 — Mockup-button audit + remaining migrations (commit 097bc2e)
- **`scripts/audit-mockup-buttons.sh`** — developer-facing audit script. Prints empty `onPress={() => {}}`/`{() => undefined}` matches and raw-async `onPress={async ...}` matches under `mobile/app/`. Uses multiline PCRE (`git grep -znP`) so ActionButton callsites are correctly excluded from the "raw async" detector.
- **`mobile/app/(tabs)/cards.tsx`** — quest "Забрать" claim button: raw async `<TouchableOpacity onPress={async () => { await apiClient.claimQuest(...); ... }}>` → `<ActionButton label="Забрать" endpointKey={\`claimQuest:${q.id}\`} onPress={async ...}>`. Inherits single-flight + offline + rate-limit awareness.
- **`mobile/app/payment.tsx`** — removed dead `AppAlert` + `useAppAlert` import / state / JSX. The hook was wired (`const alert = useAppAlert()`) and `<AppAlert {...alert.props} />` rendered, but `alert.success/error/...` was never called — toasts had already replaced it in plan 04-03 (M-M1). Deletion removed the last AppAlert consumer in `mobile/app/`.

**Audit result before:** 1 raw async match (cards.tsx:771).
**Audit result after:** `(none)` x 2.

### Task 2 — ESLint D-08 (commit d4e4d5f)
- **`mobile/eslint.config.js`** — added a flat-config block scoped to `app/**/*.tsx` with three `no-restricted-syntax` selectors:
  1. `JSXAttribute[name.name='onPress'][value.expression.type='ArrowFunctionExpression'][value.expression.body.type='BlockStatement'][value.expression.body.body.length=0]` → `'Empty onPress is forbidden'`
  2. `JSXAttribute[name.name='onPress'][...body.type='Identifier'][body.name='undefined']` → `'onPress={() => undefined} is forbidden'`
  3. `JSXOpeningElement:not([name.name='ActionButton']) > JSXAttribute[name.name='onPress'][value.expression.type='ArrowFunctionExpression'][value.expression.async=true]` → `'Raw async onPress is forbidden — use <ActionButton />'`
- **`mobile/eslint-rules/__tests__/no-raw-mutation-button.test.js`** — 4 jest tests, all PASS. Shells out to local `eslint` CLI via `spawnSync` because jest-expo CJS VM cannot dynamic-import the flat config.

### Task 3 — regression-guard Phase-4 + AppAlert deletion (commit f24411f)
- **`scripts/regression-guard.sh`** — appended `=== Phase-4 gates ===` block (6 gates). All green on this commit.
- **DELETED** `mobile/components/AppAlert.tsx` (-432 lines) and `mobile/hooks/useAppAlert.ts` (-110 lines). Final consumer migrated in Task 1.
- **Rule 1 fix** — `admin/src/App.jsx:151`: login placeholder `'+79001234567'` (Gold test cred) → `'+7XXXXXXXXXX'`. Pre-existing Phase-2 SEC-05 regression introduced by plan 04-04 wiring; the only thing blocking regression-guard exit-0.

## Mockup-button Audit Decisions

| File | Pattern Found | Decision | Outcome |
|------|---------------|----------|---------|
| mobile/app/(tabs)/cards.tsx:771 | raw async TouchableOpacity (quest claim) | **Wire** → ActionButton | Migrated; Russian label "Забрать" preserved verbatim |
| mobile/app/payment.tsx (AppAlert wiring) | dead `useAppAlert()` + `<AppAlert/>` | **Hide** (remove dead JSX) | Toast already replaced it; removed import + state + render |

No empty `() => {}` onPress matches were found across mobile/app/; plans 04-01 / 04-03 had already wired or removed every shadow button on transfer / payment / login / topup / qr / cards primary flows.

## ESLint Rule Implementation Choice

`no-restricted-syntax` selectors directly in the flat config (no custom rule plugin needed).

**Rationale:**
- The three patterns are AST-shape checks, not behavioral analysis — they map cleanly to ESLint AST query selectors.
- Custom rule plugin would have required publishing to a workspace path, registering via `plugins:`, and complicating CI. Selectors are inline, version-controlled, reviewable in a diff.
- The `JSXOpeningElement:not([name.name='ActionButton'])` parent-selector form correctly excludes ActionButton (the intentional async-onPress consumer) without false positives.

**Test infra deviation:** ESLint Node API loads flat config via dynamic `import()`. jest-expo's CJS VM throws `TypeError: A dynamic import callback was invoked without --experimental-vm-modules`. Worked around by shelling out to the local `eslint` CLI from the test file (`spawnSync('npx', ['--no-install', 'eslint', '--format', 'json', fixture])`) — which runs in a normal Node process. All 4 tests green.

## regression-guard.sh Final Run (Phase-4 block)

```
=== Phase-4 gates ===
OK    Phase-4 D-03: AppAlert.tsx removed
OK    Phase-4 D-03: no AppAlert imports
OK    Phase-4 D-07: Empty onPress in mobile/app
OK    Phase-4 D-06/D-08: no raw async onPress on Touchable/Pressable in mobile/app
OK    Phase-4 D-12: mergeByUpdatedAt.ts present
OK    Phase-4 D-05: root ErrorBoundary mounted
OK    Phase-4 D-09: OfflineBanner/ToastHost mounted

Regression-guard passed.
```

Phase-1, Phase-2, Phase-3 blocks also green on this commit.

## 18 MEDIUM TRIAGE Bugs Closed Across Phase 4

| ID | Title | Closed In Plan | Test |
|----|-------|----------------|------|
| M-B1 | Conflicting transactional reads | 04-02 | backend integration |
| M-B2 | Push notification body unbounded | 04-02 | backend |
| M-B3 | Cron tick missing leader lock (covered by 03-13) | 04-02 | backend |
| M-B4 | Audit log gaps | 04-02 | backend |
| M-B5 | Idempotency-Key honored on payments | 04-02 | backend |
| M-B6 | Backend log noise / PII redaction | 04-02 | backend |
| M-B7 | Trade reservation race | 04-02 | backend |
| M-B8 | Webhook outbox / retry | 04-02 | backend |
| M-M1 | Payment mutation issues vs background reload | 04-03 | payment-error-split |
| M-M2 | Transfer recipient clear | 04-03 | transfer-recipient-clear |
| M-M3 | Login double-tap | 04-03 | login-double-tap |
| M-M4 | Interval cleanup leaks | 04-03 | interval-cleanup |
| M-M5 | OfflineBanner mounts when network down | 04-03 / 04-01 | OfflineBanner |
| A-M1..A-M5 | Admin primitives wired (5 admin MEDIUM bugs) | 04-04 | admin vitest x44 |
| **D-07 audit** | mockup-button surface zeroed | **04-05** | audit script + lint + grep |
| **D-08 lint gate** | raw async onPress blocked | **04-05** | eslint-rules x4 |

## Russian Copy Invariants

- "Забрать" preserved verbatim on quest claim (cards.tsx).
- "Оплатить" / "Перевести" / payment success copy unchanged in payment.tsx (only AppAlert wrapper removed; Toast copy untouched).
- admin login: placeholder format-only change (`+7XXXXXXXXXX`) — no functional Russian copy affected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Pre-existing] admin/src/App.jsx login placeholder Phase-2 SEC-05 regression**
- **Found during:** Task 3 final verification (`bash scripts/regression-guard.sh`)
- **Issue:** `admin/src/App.jsx:151` had `placeholder="+79001234567"` (Gold test phone). Phase-2 D-15/SEC-05 regression-guard catches this pattern outside `backend/src/seed/`. Reintroduced by plan 04-04 wiring (commit cfb8198).
- **Fix:** Replaced with format-only placeholder `+7XXXXXXXXXX`. Zero functional impact.
- **Files modified:** admin/src/App.jsx
- **Commit:** f24411f

**2. [Rule 3 — Audit pattern refinement] Multiline PCRE for ActionButton exemption**
- **Found during:** Task 1, after migrating cards.tsx claim button to ActionButton — the audit script's naive `onPress={async` regex still matched the new (legitimate) ActionButton callsite.
- **Issue:** Audit and regression-guard regex was over-broad; would have flagged every ActionButton with async onPress as a violation.
- **Fix:** Switched to `<(TouchableOpacity|Pressable)\b[^>]*onPress=\{\s*async\s` with `git grep -znP` so PCRE spans multi-line JSX openings while restricting to the unwrapped touchables.
- **Files modified:** scripts/audit-mockup-buttons.sh, scripts/regression-guard.sh
- **Commit:** 097bc2e (audit), f24411f (regression-guard)

### Test Infrastructure Deviation

**3. [Rule 3] ESLint test shells out to CLI**
- ESLint flat config requires dynamic `import()`; jest-expo's VM environment doesn't enable `--experimental-vm-modules`.
- Test now spawns `npx --no-install eslint --format json <fixture>` and parses JSON output. All 4 cases pass (1.0–1.6 s each).

## Deferred Issues (out of scope per scope-boundary rule)

These are pre-existing baseline issues not introduced by Plan 04-05. They surface during full-suite verification but are out of scope. Logged here, not fixed:

- **mobile/app/_layout.tsx:19** — `Cannot find module '@react-native-community/netinfo'` (TS2307). Module is installed at runtime; `@types/...` resolution issue. Pre-existing TS error.
- **mobile/app/_layout.tsx:49** — `Parameter 's' implicitly has an 'any' type`. Pre-existing.
- **mobile/ npm test full suite** — jest-expo + RN 0.81 + React 19 + Node 25 incompatibility crashes process on `e2e/login.test.js` and `components/__tests__/StyledText-test.js` with `TypeError: window.dispatchEvent is not a function` from react-test-renderer. Pre-existing on worktree base. The 20 tests covering plan-relevant components (ActionButton, Toast, ConfirmDialog, OfflineBanner, ErrorBoundary, eslint-rules, payment-error-split, transfer-recipient-clear, mergeByUpdatedAt, store-errors, tokenStore, BootGate, login-double-tap, biometric-guard, interval-cleanup) all pass.
- **mobile lint baseline** — `npx eslint app/ --max-warnings=0` fails with 1 unrelated import-resolution error and 51 unused-vars warnings on the pre-existing tree (split-bill, trade, qr, transaction/[id]). Not introduced by Phase-4. Phase-4-specific selectors all behave correctly (verified by the 4-test ESLint unit suite).
- **admin/ npm run build** — succeeds. Stderr warnings about backend/src/schemas/ named exports (`convertSchema`, `sourceSchema`, `grantCardSchema` not exported) are emitted but build completes (`✓ built in 1.23s`). Pre-existing schema export gap, out of scope.
- **backend/ npm test** — not run in this plan (scope: closure gates for mobile + admin + scripts). Backend was verified green by plan 04-02 SUMMARY.

## Verification Chain Outcomes

| Step | Result | Notes |
|------|--------|-------|
| `bash scripts/regression-guard.sh` | exit 0 | All 4 phases green; Phase-4 block fully green |
| `bash scripts/audit-mockup-buttons.sh` | exit 0 | reports `(none)` twice |
| `cd mobile && npx jest eslint-rules --runInBand` | 4/4 PASS | new test file |
| `cd mobile && npx jest --testPathPattern='ActionButton|ConfirmDialog|Toast|OfflineBanner|ErrorBoundary|eslint-rules|payment-error-split|transfer-recipient'` | 20/20 PASS | all plan-relevant components |
| `cd admin && npx vitest run` | 44/44 PASS | unchanged |
| `cd admin && npm run build` | exit 0 | built in 1.23s |
| `cd mobile && npx tsc --noEmit` | 2 pre-existing errors | both in _layout.tsx, pre-existing baseline |
| `cd mobile && npm test` (full) | crashes pre-existing | jest-expo + RN 0.81 + Node 25 infra issue, pre-existing |
| `test ! -f mobile/components/AppAlert.tsx` | TRUE | file deleted |
| `git grep "from .*AppAlert" mobile/` | 0 matches | last consumer cleared |

## Phase-4 Closure

With this plan, Phase 4 (MEDIUM Bug Fixes + Shared UX Primitives) is **complete**:
- 18 TRIAGE MEDIUM bugs closed (8 backend M-B*, 5 mobile M-M*, 5 admin A-M*).
- Shared primitives (ActionButton, Toast, ConfirmDialog, OfflineBanner, ErrorBoundary, mergeByUpdatedAt) shipped and consumed.
- AppAlert split into Toast/ConfirmDialog and physically removed.
- Lint + grep belt-and-suspenders gates active to prevent silent regressions in future PRs.

## Self-Check: PASSED

Created files (all FOUND):
- `scripts/audit-mockup-buttons.sh` (executable)
- `mobile/eslint-rules/__tests__/no-raw-mutation-button.test.js`

Deleted files (verified absent):
- `mobile/components/AppAlert.tsx`
- `mobile/hooks/useAppAlert.ts`

Commits (all in `git log`):
- `097bc2e` Task 1
- `d4e4d5f` Task 2
- `f24411f` Task 3
