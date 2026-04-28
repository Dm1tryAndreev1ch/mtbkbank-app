---
phase: 05-animation-foundations
plan: 02
subsystem: mobile/animation-hooks
tags: [animation, hooks, reanimated, mobile, anim-02]
requirements: [ANIM-02]
dependency-graph:
  requires:
    - "react-native-reanimated@4.1.1 (already installed)"
    - "Phase-4 D-04 stub at mobile/hooks/useReducedMotion.ts (replaced)"
  provides:
    - "mobile/hooks/useReducedMotion.ts — re-export of Reanimated's hook"
    - "mobile/hooks/useCancellableAnimation.ts — register(sv) collector with unmount cleanup"
    - "mobile/hooks/__tests__/useCancellableAnimation.test.tsx — leak-prevention contract pin"
  affects:
    - "mobile/components/Skeleton.tsx (caller — prefers-reduced-motion branch flips live, no edit needed)"
    - "Phase 6 card/deck/HP animations (will register SVs to prevent leaks)"
    - "Phase 7 polish gestures (will register SVs to prevent leaks)"
tech-stack:
  added: []
  patterns:
    - "Re-export hook owned by us, impl owned by Reanimated"
    - "useRef<Set>() collector + useEffect cleanup for SharedValue cancellation"
    - "Reanimated jest mock: spread react-native-reanimated/mock + override cancelAnimation as jest.fn()"
key-files:
  created:
    - mobile/hooks/useCancellableAnimation.ts
    - mobile/hooks/__tests__/useCancellableAnimation.test.tsx
  modified:
    - mobile/hooks/useReducedMotion.ts
decisions:
  - "Re-export form chosen over named binding: cleaner one-liner, single point of swap"
  - "Set-backed registry over array: idempotent re-registration without manual dedupe"
  - "register() returns the SV to enable chained registration (`const x = register(useSharedValue(0))`)"
  - "Misuse silent (D-05) — no console.warn, no Sentry breadcrumb; unit test is the structural guardrail"
metrics:
  duration: 4min
  tasks: 3
  files: 3
  completed: 2026-04-28
---

# Phase 5 Plan 02: Animation Hooks Summary

ANIM-02 ships: `useReducedMotion` becomes a one-line re-export of Reanimated's built-in hook, replacing the Phase-4 stub; new `useCancellableAnimation` collector hook prevents leaked worklet timers across screen transitions; unit test pins the mid-spring unmount cleanup contract.

## What Shipped

1. **`mobile/hooks/useReducedMotion.ts`** — replaced the Phase-4 `return false` stub with `export { useReducedMotion } from 'react-native-reanimated'`. Reanimated 4 internally uses `AccessibilityInfo.isReduceMotionEnabled()` plus the `'reduceMotionChanged'` listener — no need to hand-roll. Skeleton's existing prefers-reduced-motion branch flips live automatically (D-03 — no Skeleton edit required).
2. **`mobile/hooks/useCancellableAnimation.ts`** (new) — `register(sv)` collector backed by `useRef<Set<SharedValue>>()`. Unmount cleanup iterates the Set calling `cancelAnimation(sv)` on each, then clears. Returns the SV (chainable). Set-backed → idempotent (D-04, D-05).
3. **`mobile/hooks/__tests__/useCancellableAnimation.test.tsx`** (new) — two tests:
   - mid-spring unmount calls `cancelAnimation` exactly once with the registered SV reference (D-06).
   - double-registering the same SV still calls `cancelAnimation` exactly once (idempotent contract).

## Verification

- `cd mobile && npx jest hooks/__tests__/useCancellableAnimation.test.tsx --runInBand` → 2 passed, 0 failed (7.6s)
- `cd mobile && npx tsc --noEmit -p .` → exit 0
- `grep -q "export { useReducedMotion } from 'react-native-reanimated'" mobile/hooks/useReducedMotion.ts` → exit 0
- `test ! -d mobile/animations` → exit 0 (D-01 enforcement: no parallel animations dir)

## Commits

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 | feat | 42ad39b | Replace useReducedMotion stub with Reanimated re-export |
| 2 | feat | b4636c6 | Add useCancellableAnimation collector hook |
| 3 | test | 7b21743 | Pin useCancellableAnimation cleanup contract |

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed against their action specs verbatim; no Rule 1/2/3 auto-fixes triggered, no Rule 4 architectural escalation needed.

## Authentication Gates

None.

## Decisions Made

- **Re-export form** (D-02 Claude's discretion): chose the direct `export { useReducedMotion } from 'react-native-reanimated'` form over a named-const binding — reads as a single statement, no shadow identifier.
- **`register` return value** (D-04 Claude's discretion): returns the SV to enable chained registration (`const x = register(useSharedValue(0))`) — used in the second test's `DoubleRegister` fixture for clarity (we register the same SV twice).
- **Test-file extension**: `.test.tsx` (renders JSX), co-located in `mobile/hooks/__tests__/` per existing convention.

## Threat Model Compliance

- **T-05-02-01 (DoS — leaked worklet timers)**: mitigated by hook impl + pinned by Task 3 unit test.
- **T-05-02-02 (Info disclosure — useReducedMotion re-export)**: no-finding stands — boolean OS preference, no PII.
- **T-05-02-03 (Tampering — misuse silence)**: accepted per D-05; structural guardrail = unit test, not runtime instrumentation.

## Known Stubs

None. The Phase-4 `return false` stub at `mobile/hooks/useReducedMotion.ts` was replaced with a live re-export by this plan.

## Self-Check: PASSED

- `mobile/hooks/useReducedMotion.ts` → FOUND (modified)
- `mobile/hooks/useCancellableAnimation.ts` → FOUND (created)
- `mobile/hooks/__tests__/useCancellableAnimation.test.tsx` → FOUND (created)
- Commit `42ad39b` → FOUND in git log
- Commit `b4636c6` → FOUND in git log
- Commit `7b21743` → FOUND in git log
