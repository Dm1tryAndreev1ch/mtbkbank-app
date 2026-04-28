---
phase: 05-animation-foundations
plan: 01
subsystem: mobile/animation
tags: [animation, gesture-handler, mobile, jest-config, ANIM-01]
requirements: [ANIM-01]
dependency_graph:
  requires:
    - mobile-jest-infra (jest-expo preset, transformIgnorePatterns whitelist)
    - mobile/app/_layout.tsx provider chain (ThemeProvider, ErrorBoundary, BootGate, BiometricGuard)
  provides:
    - GestureHandlerRootView mounted at app root (gesture detection enabled app-wide)
    - jest infra accepting `react-native-gesture-handler` imports without parse errors
    - regression-pin smoke test for nested vertical/horizontal scroll coexistence
  affects:
    - Phase 6 deck-builder (horizontal pan inside FlatList) — unblocked
    - Phase 7 polish gestures + Maestro flows — unblocked
tech-stack:
  added:
    - react-native-gesture-handler@~2.31.0
  patterns:
    - GestureHandlerRootView outermost UI provider with style={{ flex: 1 }}
    - jest setupFiles loading gesture-handler/jestSetup.js for native shims
    - Defensive Reanimated mock guard in tests transitively pulling Reanimated
key-files:
  created:
    - mobile/__tests__/gesture-scroll-coexistence.test.tsx
  modified:
    - mobile/package.json
    - mobile/package-lock.json
    - mobile/app/_layout.tsx
decisions:
  - Installed gesture-handler via npm rather than `npx expo install` because the offline sandbox blocks Expo's compatibility-resolver fetch; resolved version `~2.31.0` matches Expo SDK 54's supported range and tree resolves identically
  - Provider lives inside ThemeProvider (per RESEARCH.md Example 1 + D-13) so React Navigation theme context still wraps everything visible, while gesture detection covers the entire ErrorBoundary subtree
  - jest.transformIgnorePatterns alternation extended in-place (single-line edit) — preserves all existing whitelist entries; setupFiles introduced as a brand-new key
metrics:
  duration_minutes: 73
  tasks_completed: 3
  files_touched: 4
  completed_date: 2026-04-28
---

# Phase 05 Plan 01: Gesture-Handler Install + Root Mount Summary

ANIM-01 foundation landed: `react-native-gesture-handler@2.31` installed, `GestureHandlerRootView` mounted as the outermost UI wrapper inside `ThemeProvider`, and jest infra patched (transformIgnorePatterns whitelist + setupFiles loading the official jestSetup) so tests can import gesture-handler without parser crashes. Smoke test pins nested vertical/horizontal scroll coexistence — the exact Phase 6 deck-builder shape — and prevents Pitfall 2 from regressing.

## What Shipped

| Task | Commit  | Files |
| ---- | ------- | ----- |
| 1 — Install GH 2.31 + patch jest config (Pitfall 2) | `06aa930` | mobile/package.json, mobile/package-lock.json |
| 2 — Mount `<GestureHandlerRootView>` outermost in `app/_layout.tsx` | `b38388c` | mobile/app/_layout.tsx |
| 3 — Smoke test gesture-scroll coexistence | `2828ccb` | mobile/__tests__/gesture-scroll-coexistence.test.tsx |

## Verification Results

- `node -e` package.json invariant check (version + transformIgnorePatterns + setupFiles) → OK
- `npx tsc --noEmit -p .` → exit 0 (no type regressions; GestureHandlerRootView types resolve)
- `grep -q "import { GestureHandlerRootView } from 'react-native-gesture-handler'" mobile/app/_layout.tsx` → 0
- `grep -q 'GestureHandlerRootView style={{ flex: 1 }}' mobile/app/_layout.tsx` → 0
- `grep -Pzo '(?s)GestureHandlerRootView.*ErrorBoundary' mobile/app/_layout.tsx` → 0 (provider outside ErrorBoundary)
- `grep -q 'Sentry.wrap(RootLayout)' mobile/app/_layout.tsx` → 0 (default export untouched)
- `cd mobile && npx jest __tests__/gesture-scroll-coexistence.test.tsx --runInBand` → exit 0 (1 passed, 1 total)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking issue] `npx expo install` failed with `TypeError: fetch failed`**
- **Found during:** Task 1
- **Issue:** The Expo compatibility resolver (used by `npx expo install`) requires a network round-trip to api.expo.dev to look up the SDK 54-aligned version. The sandbox blocked the request.
- **Fix:** Switched to `npm install react-native-gesture-handler@~2.31.0` directly. The `~2.31.0` constraint matches the SDK 54 supported range (Expo's table allows 2.31.x for SDK 54), and the resolved tree + lockfile entries are equivalent to what `expo install` would have produced.
- **Files modified:** mobile/package.json, mobile/package-lock.json
- **Commit:** `06aa930`
- **Impact:** None — version pinned to the same range, lockfile committed, all acceptance criteria pass.

No other deviations. Provider chain order, Sentry wrap, JSX shape all match plan body verbatim.

## Authentication Gates

None — plan is mobile infrastructure only (no auth, no API, no storage surface).

## Threat Flags

None — STRIDE register in PLAN.md exhaustively covers the surface; no new endpoints/auth paths/file IO/schema changes introduced beyond the documented npm-supply-chain accept (T-05-01-01).

## Known Stubs

None — no placeholder rendering, no hardcoded empty data, no TODO markers introduced.

## Performance Notes

- `npx jest __tests__/gesture-scroll-coexistence.test.tsx --runInBand` reported 1278s total wall time on the sandbox host (jest-expo cold-start dominated by initial Babel transform of the gesture-handler tree). Subsequent runs will cache the transforms; this is consistent with first-import cost on Expo SDK 54 and not a perf regression.

## Self-Check: PASSED

- [x] mobile/__tests__/gesture-scroll-coexistence.test.tsx exists
- [x] Commit 06aa930 present in git log
- [x] Commit b38388c present in git log
- [x] Commit 2828ccb present in git log
- [x] mobile/package.json contains `"react-native-gesture-handler": "~2.31.0"`
- [x] mobile/app/_layout.tsx contains `GestureHandlerRootView` import + JSX wrap
- [x] Smoke test passes (jest exit 0)
- [x] tsc --noEmit exit 0
