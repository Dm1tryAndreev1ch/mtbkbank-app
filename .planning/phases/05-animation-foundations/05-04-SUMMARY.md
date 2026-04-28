---
phase: 05-animation-foundations
plan: 04
subsystem: ci/regression-guard
tags: [regression-guard, ci, mobile, animation, anim-01, anim-02, anim-03, d-10]
requires:
  - 05-01 (GestureHandlerRootView mount in mobile/app/_layout.tsx)
  - 05-02 (mobile/hooks/useReducedMotion.ts + useCancellableAnimation.ts)
  - 05-03 (mobile/eslint-rules/no-zustand-in-worklet.js + wiring at error severity)
provides:
  - Phase-5 belt-and-suspenders regression-guard section
affects:
  - scripts/regression-guard.sh (additive only)
tech-stack:
  added: []
  patterns:
    - Append-only regression-guard discipline (Pitfall 6 honored)
    - Set-intersection proximity check for D-10 (worklet ∩ useStore)
    - Path-exclusion pathspec `:!mobile/eslint-rules/**` to skip self-referential rule source
key-files:
  created: []
  modified:
    - scripts/regression-guard.sh
decisions:
  - Excluded `mobile/eslint-rules/**` from D-10 proximity scan (Rule 1 fix). The rule
    implementation and its tests legitimately mention both `'worklet'` and `useStore` as
    string literals (they detect/test the pattern); they are not worklets themselves.
metrics:
  duration_minutes: ~10
  completed: 2026-04-28
  tasks_completed: 1
  files_changed: 1
---

# Phase 5 Plan 04: Regression-Guard Extension Summary

One-liner: Phase-5 append-only belt-and-suspenders section in `scripts/regression-guard.sh` catches reverts of GestureHandlerRootView, the two animation hooks, the `mt-bank/no-zustand-in-worklet` lint wiring, and the D-10 worklet/useStore proximity risk.

## What shipped

A new `=== Phase-5 regression-guard ===` section was inserted into `scripts/regression-guard.sh` immediately after the existing `=== Phase-4.5 final regression-guard ===` block and BEFORE the tail-block (`if [[ $FAIL -eq 0 ]]; then echo "OK: Phase-4.5 final ..."` and the final `Regression-guard FAILED` / `Regression-guard passed.` exit logic). All earlier Phase-1 through Phase-4.5 checks remain verbatim — Pitfall 6 (append-only) honored.

### Belt checks added

| Check | Trigger when | Rationale |
|-------|--------------|-----------|
| Phase-5 ANIM-01 — `GestureHandlerRootView` mount | string missing from `mobile/app/_layout.tsx` | Fails if 05-01 provider mount is reverted |
| Phase-5 ANIM-01 — `react-native-gesture-handler@2.31.x` pin | dep removed or version drift in `mobile/package.json` | Locks version per stack decision |
| Phase-5 ANIM-02 — both hooks present | `mobile/hooks/useReducedMotion.ts` or `useCancellableAnimation.ts` deleted | 05-02 deliverable |
| Phase-5 ANIM-02 — `useReducedMotion` re-exports from Reanimated | re-export line removed (D-02) | Prevents drift to a custom hook |
| Phase-5 D-01 — `mobile/animations/` absent | directory created | Hooks must live in `mobile/hooks/` only |
| Phase-5 ANIM-03 — `mt-bank/no-zustand-in-worklet` wired at `'error'` | rule file deleted OR severity flipped to `'warn'`/`'off'` | Disabling alone must not pass CI |
| Phase-5 D-10 — proximity check | ANY `mobile/` file (excluding `mobile/eslint-rules/**`) contains both `'worklet'` and `useStore` | Belt for ANIM-03 — even if the rule is disabled, this grep catches the structural risk |

### Verification on clean tree

```
=== Phase-5 regression-guard ===
OK    Phase-5 ANIM-01: GestureHandlerRootView mounted in mobile/app/_layout.tsx
OK    Phase-5 ANIM-01: react-native-gesture-handler@2.31.x in mobile/package.json
OK    Phase-5 ANIM-02: mobile/hooks/{useReducedMotion,useCancellableAnimation}.ts present
OK    Phase-5 ANIM-02: useReducedMotion re-exports from react-native-reanimated
OK    Phase-5 D-01: mobile/animations/ does not exist
OK    Phase-5 ANIM-03: mt-bank/no-zustand-in-worklet wired at error severity
OK    Phase-5 D-10: no worklet files yet
OK: Phase-5 regression-guard
OK: Phase-4.5 final regression-guard
Regression-guard passed.
```

`bash scripts/regression-guard.sh` → exit 0. `bash -n scripts/regression-guard.sh` → exit 0.

### Synthetic revert smoke test (manual)

Renamed `mobile/hooks/useCancellableAnimation.ts` → `.bak` and re-ran the guard. As expected:

```
FAIL  Phase-5 ANIM-02: missing hook(s) in mobile/hooks/
Regression-guard FAILED — fix the listed pattern(s) before committing.
EXIT=1
```

File restored after the test.

## Deviations from Plan

### Rule 1 — Bug fix: D-10 proximity false positives

The plan's D-10 belt as drafted (`git grep -lF "'worklet'" -- 'mobile/'`) intersected with `useStore` files matched the lint rule's own implementation (`mobile/eslint-rules/no-zustand-in-worklet.js`) and its tests (`mobile/eslint-rules/__tests__/no-zustand-in-worklet.test.js`). These files reference both literals only because they DETECT the pattern — they are AST visitors, not worklets, and cannot run on the UI thread.

**Fix:** Added pathspec exclusion `':!mobile/eslint-rules/**'` to the `git grep` invocation so the proximity scan skips the rule directory entirely. Application code (worklets in `mobile/components/**`, `mobile/app/**`, etc.) is still covered. The plan itself anticipated this: "Phase 6 may refine if false positives surface" — refinement applied now to keep the guard green on the clean tree.

- Files modified: `scripts/regression-guard.sh` (one-line pathspec change with comment)
- Commit: `8251731`

## Worktree note

This plan executed in worktree `agent-a099cc4809bc9d274`. The worktree's HEAD was advanced past the prescribed base (`d158aa1`) on first inspection (filesystem also out of sync), so `git reset --hard d158aa1` was performed per the worktree_branch_check protocol before any edits. All commits land on the worktree branch from this worktree's `pwd`.

## Self-Check: PASSED

- `scripts/regression-guard.sh` modified ✓ (commit `8251731`)
- `bash -n scripts/regression-guard.sh` exit 0 ✓
- `bash scripts/regression-guard.sh` exit 0 on clean tree ✓
- Phase-5 section appears between Phase-4.5 final and tail-block ✓
- Phase-1..4.5 checks intact ✓
- Tail-block (`Regression-guard FAILED` / `Regression-guard passed.`) untouched ✓
- All required acceptance-criteria grep markers present ✓
- Synthetic revert exits 1 ✓
