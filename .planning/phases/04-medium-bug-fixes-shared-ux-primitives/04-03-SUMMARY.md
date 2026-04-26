---
phase: 04-medium-bug-fixes-shared-ux-primitives
plan: 03
subsystem: mobile-medium-bugs
tags: [mobile, ux, error-handling, react-native, expo-router, MEDIUM]
requires:
  - 04-01 (Toast / ActionButton / InlineError / ErrorBoundary primitives merged in base 854e5da)
provides:
  - "M-M1 closed: payment-mutation errors render via InlineError + ActionButton's Toast; reload errors → info Toast"
  - "M-M2 closed: (tabs)/_layout setInterval pair has correct cleanup return; pinned by spy test"
  - "M-M3 closed: switching transfer method (phone↔own) clears recipient field"
  - "M-M4 closed: login phone TextInput has maxLength={12}"
  - "M-M5 closed: app/index.tsx + (tabs)/_layout.tsx mounted under route ErrorBoundary"
  - "UX-04 partial: 5 mutation buttons across payment/transfer/login migrated to <ActionButton/>"
affects:
  - mobile/app/payment.tsx
  - mobile/app/transfer.tsx
  - mobile/app/login.tsx
  - mobile/app/(tabs)/_layout.tsx
  - mobile/app/index.tsx
tech-stack:
  added: []
  patterns:
    - "ActionButton single-flight CTA replaces raw async TouchableOpacity"
    - "InlineError reads issues[] from VALIDATION_FAILED contract"
    - "withRouteBoundary() wraps default export to enforce per-route fallback"
key-files:
  created:
    - mobile/components/__tests__/payment-error-split.test.tsx
    - mobile/components/__tests__/transfer-recipient-clear.test.tsx
    - mobile/components/__tests__/interval-cleanup.test.tsx
  modified:
    - mobile/app/payment.tsx
    - mobile/app/transfer.tsx
    - mobile/app/login.tsx
    - mobile/app/(tabs)/_layout.tsx
    - mobile/app/index.tsx
decisions:
  - "Background account-reload in payment.tsx is a mount useEffect that calls api.getAccounts() directly with try/catch — using loadAccounts() would have masked failure inside the store's silent catch."
  - "handlePay/handleTransfer THROW their validation errors so ActionButton's catch path surfaces them via Toast; the manual setLoading boilerplate is removed."
  - "transfer.tsx header back-arrow now exposes testID='transfer-back' purely to enable the regression test — semantics unchanged."
  - "TabLayoutInner + TabLayout split keeps the ErrorBoundary outside the function whose hooks/state we want to crash; matches the React docs pattern."
metrics:
  completed: 2026-04-26
  duration: ~25 min
  tasks: 2
  files_modified: 5
  files_created: 3
  commits: 5
---

# Phase 04 Plan 03: Mobile MEDIUM bug fixes consuming Wave-1 primitives — Summary

Closed 5 mobile MEDIUM bugs (M-M1..M-M5) by consuming the Toast / ActionButton /
InlineError / ErrorBoundary primitives that landed in plan 04-01. Each fix is a
small per-screen edit: the heavy lifting is in the primitives.

## Bug Closures

| Bug ID | File:Line                                  | Fix |
|--------|---------------------------------------------|------|
| M-M1   | mobile/app/payment.tsx:75, 80-99, 110-149, 276 | Split mutation errors (InlineError + ActionButton's Toast) from background reload errors (info Toast). Form is no longer marked errored on a balance-refresh network failure. |
| M-M2   | mobile/app/(tabs)/_layout.tsx:28-37          | setInterval cleanup `return () => clearInterval(id)` confirmed by spy test; deps are stable thanks to Zustand selector identity. |
| M-M3   | mobile/app/transfer.tsx:74-79, 152            | `handleMethodChange(m)` now `setRecipient('')` in the same dispatch, plus clears resolved-user state. |
| M-M4   | mobile/app/login.tsx:101                      | `<TextInput … maxLength={12} />` caps phone at `+7XXXXXXXXXX`. |
| M-M5   | mobile/app/index.tsx:21, mobile/app/(tabs)/_layout.tsx:139-145 | `withRouteBoundary(Index, 'bootstrap')` wraps the default export; `<ErrorBoundary scope="route" routeName="tabs">` wraps the whole tabs subtree. |

## ActionButton callsite migration (UX-04 partial)

| Screen           | Callsites migrated | Russian copy landed (UI-SPEC §Primary CTAs) |
|------------------|--------------------|---------------------------------------------|
| payment.tsx      | 1 (`Оплатить`)      | label "Оплатить" / busyLabel "Оплачиваем…" / success Toast "Платёж выполнен" |
| transfer.tsx     | 1 (`Перевести`)     | label "Перевести" / busyLabel "Отправляем перевод…" / success Toast "Перевод отправлен" |
| login.tsx        | 1 (`Войти`)         | label "Войти" / busyLabel "Входим…" / no toast (navigation IS the affirmation) |

`git grep -nP "onPress=\{\s*async" mobile/app/payment.tsx mobile/app/transfer.tsx mobile/app/login.tsx` → 0 matches.

## Test outcomes

| Test                                                          | Result | Tests |
|---------------------------------------------------------------|--------|-------|
| mobile/components/__tests__/payment-error-split.test.tsx       | PASS   | 2/2   |
| mobile/components/__tests__/transfer-recipient-clear.test.tsx  | PASS   | 1/1   |
| mobile/components/__tests__/interval-cleanup.test.tsx          | PASS   | 4/4   |
| mobile/__tests__/login-double-tap.test.tsx (regression)        | PASS   | 4/4   |

Plan-required: 3/3 new tests green. login-double-tap (Phase-2 02-08 regression)
unaffected.

## Russian copy strings landed

- payment.tsx: "Оплатить", "Оплачиваем…", "Платёж выполнен", "Не удалось обновить баланс" (info toast on reload fail)
- transfer.tsx: "Перевести", "Отправляем перевод…", "Перевод отправлен"
- login.tsx: "Войти", "Входим…"

## Leftover Alert.alert callsites (handed to plan 05 final guard)

`git grep -n "Alert\.alert" mobile/app/payment.tsx mobile/app/transfer.tsx mobile/app/login.tsx` → 0 matches in
the plan-04-03 scope. Out-of-scope mobile screens (history, register, qr-pay,
products, etc.) still use Alert.alert — those are owned by plan 04-05's audit
sweep per CONTEXT.md Wave-3 plan list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] payment.tsx reload-error path needed direct api.getAccounts()**

- **Found during:** Task 1
- **Issue:** The plan said "wrap loadAccounts in try/catch in useEffect", but
  `useStore.loadAccounts` already swallows its own error into `state.error` — a
  try/catch around it would never trigger. To produce the "background reload
  failed → info toast" behavior the test asserts, I instead added a mount-effect
  that calls `api.getAccounts()` directly and toasts on rejection, then writes
  fresh data via `useStore.setState({ accounts: data })`.
- **Fix:** New `useEffect` in payment.tsx wraps a direct `api.getAccounts()` call
  with the cancellation pattern (cleanup sets `cancelled = true`).
- **Files modified:** mobile/app/payment.tsx
- **Commit:** 2934b8e

**2. [Rule 2 - Critical] Removed dead state to keep ActionButton authoritative**

- **Issue:** `loading`/`setLoading` was duplicated by ActionButton's internal
  `busy` state; leaving the local state could desync (e.g. ActionButton thinks
  the call is done but the screen still shows the spinner).
- **Fix:** Dropped `const [loading, setLoading] = useState(false)` from
  transfer.tsx; payment.tsx similarly relies on ActionButton's busy.
- **Commit:** 2934b8e

**3. [Rule 3 - Blocking] testID on transfer.tsx header back-arrow**

- **Issue:** The M-M3 test needs to pop from form back to picker to switch
  method; the header back is a TouchableOpacity around an icon with no other
  identifier. Without a testID the test cannot deterministically tap it.
- **Fix:** Added `testID="transfer-back"` to the header TouchableOpacity. Pure
  test affordance; visual/runtime semantics unchanged.
- **Commit:** 2934b8e

### Adjustments to plan text

- The plan listed test for "form NOT marked errored" via `queryByText('Минимум 1 ₽')`
  on the reload-failure path — implemented as written.
- The plan suggested wrapping each `Tabs.Screen` individually with ErrorBoundary;
  per the in-task `<action>` "pick whichever reads cleanly", I wrapped the
  whole `TabLayoutInner` in one boundary at the export site. Same coverage
  surface, no per-tab JSX noise.

## Threat Surface Scan

No new trust boundaries introduced — all fixes consume existing primitives at
known boundaries. No `## Threat Flags` section needed.

## Verification

- `cd mobile && npx jest components/__tests__/(payment-error-split|transfer-recipient-clear|interval-cleanup)` → 7/7 PASS
- `cd mobile && npx jest __tests__/login-double-tap` → 4/4 PASS (regression)
- Acceptance criteria grep matrix:
  - `<ActionButton` in 3 screens: 3 matches
  - raw `onPress={async ...}`: 0 matches
  - `maxLength={12}` in login.tsx: 1 match
  - `<InlineError` in payment.tsx: 1 match
  - `setRecipient('')` in transfer.tsx: 1 match
  - "Перевод отправлен" / "Платёж выполнен": 3 matches
  - `clearInterval` in (tabs)/_layout.tsx: 1 match
  - ErrorBoundary route in (tabs)/_layout.tsx: 1 match
  - withRouteBoundary in app/index.tsx: 1 match (default export)

## Self-Check: PASSED

- Files exist:
  - FOUND: mobile/components/__tests__/payment-error-split.test.tsx
  - FOUND: mobile/components/__tests__/transfer-recipient-clear.test.tsx
  - FOUND: mobile/components/__tests__/interval-cleanup.test.tsx
- Commits exist (this branch):
  - FOUND: 6a71574 — RED tests for M-M1, M-M3
  - FOUND: 2934b8e — GREEN: payment/transfer/login + ActionButton + maxLength
  - FOUND: 0091602 — RED tests for M-M2, M-M5
  - FOUND: 64beab9 — GREEN: tabs + index ErrorBoundary
  - FOUND: fa9a1ef — chore: drop unused Alert import
