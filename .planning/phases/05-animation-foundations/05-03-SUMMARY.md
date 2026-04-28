---
phase: 05-animation-foundations
plan: 03
subsystem: mobile-eslint
tags: [animation, eslint, worklet, zustand, mobile, ANIM-03]
requires: [05-01]
provides:
  - "mt-bank/no-zustand-in-worklet ESLint rule (error severity)"
  - "RuleTester self-test (6 fixtures: 2 valid + 4 invalid)"
  - "Custom-rule plugin registration in mobile/eslint.config.js"
affects:
  - mobile/eslint-rules/
  - mobile/eslint.config.js
tech-stack:
  added: []
  patterns:
    - "ESLint v9 flat-config custom rule (CommonJS module.exports, meta.schema=[], messageId reports)"
    - "Per-file ImportDeclaration name tracking for re-exported store helpers (D-09)"
    - "Hand-rolled AST walker scoped to worklet bodies (directive prologue OR worklet-API callee arg)"
key-files:
  created:
    - mobile/eslint-rules/no-zustand-in-worklet.js
    - mobile/eslint-rules/__tests__/no-zustand-in-worklet.test.js
  modified:
    - mobile/eslint.config.js
decisions:
  - "Rule lives at mobile/eslint-rules/no-zustand-in-worklet.js as a local CommonJS plugin (zero new deps); registered via inline `plugins: { 'mt-bank': { rules: { ... } } }` flat-config entry."
  - "Worklet detection covers BOTH paths: 'worklet' directive prologue (catches Pitfall-5 named-arrow case) AND function literals passed as arguments to a known worklet-API callee (useAnimatedStyle / useDerivedValue / useAnimatedReaction / useAnimatedScrollHandler / useAnimatedGestureHandler / runOnUI / withSpring / withTiming)."
  - "Identifier-set seeded with useStore + useShallow and extended per-file from any ImportDeclaration whose source matches `^(\\.\\./)+stores/` or `^mobile/stores/` — defeats D-09 selector-helper re-exports."
  - "RuleTester runs via plain `node` (synchronous driver); no jest wrapper."
metrics:
  duration: ~25 min
  completed: 2026-04-28
---

# Phase 5 Plan 3: no-zustand-in-worklet ESLint Rule Summary

**One-liner:** Custom ESLint v9 rule `mt-bank/no-zustand-in-worklet` at error severity, blocks any Zustand identifier from appearing inside a Reanimated worklet body — directive path AND callee-arg path AND import-aliased helpers covered.

## What Shipped

1. **`mobile/eslint-rules/no-zustand-in-worklet.js`** — CommonJS rule module:
   - `meta.type='problem'`, `meta.schema=[]` (Pitfall 3), `messageId='zustandInWorklet'`.
   - `ImportDeclaration` visitor extends a per-file `zustandNames` Set (seeded with `useStore`/`useShallow`) with every specifier imported from a `stores/` source.
   - Visitor on `FunctionExpression, ArrowFunctionExpression` checks `isWorkletFn` (directive prologue OR callee-arg of a known worklet API) and walks the body, reporting any identifier whose name is in `zustandNames`. Walker bails on nested non-worklet functions so JS-thread closures stay unflagged.

2. **`mobile/eslint-rules/__tests__/no-zustand-in-worklet.test.js`** — RuleTester self-test:
   - 2 valid fixtures (worklet using only shared values; non-worklet `useStore` call).
   - 4 invalid fixtures: D-11 (a) `useAnimatedStyle` arrow with `'worklet'` + `useStore`; D-11 (c) `runOnUI` function with directive importing from `../../stores/useStore`; `useShallow` re-exported helper inside `useDerivedValue`; Pitfall 5 — const-assigned arrow with `'worklet'` directive passed by name to `useAnimatedStyle`.
   - All 6 fixtures pass via `node eslint-rules/__tests__/no-zustand-in-worklet.test.js` (output: `OK no-zustand-in-worklet — all fixtures passed`).

3. **`mobile/eslint.config.js`** — wired:
   - `const noZustandInWorklet = require('./eslint-rules/no-zustand-in-worklet');` added beside the existing `eslint-config-expo/flat` require.
   - New flat-config entry appended after the Phase-4 D-08 block: `plugins: { 'mt-bank': { rules: { 'no-zustand-in-worklet': noZustandInWorklet } } }`, `rules: { 'mt-bank/no-zustand-in-worklet': 'error' }`.
   - Header extended with the Phase 5 D-07 paragraph citing the rule path, the Plan-4 regression-guard belt-and-suspenders, and the CLAUDE.md anchor.
   - All Phase-2 D-25 + Phase-4 D-08 entries preserved verbatim (no reorder, no severity change, no rule edit).

## Verification

- **Rule shape:** `node -e "const r = require('./eslint-rules/no-zustand-in-worklet'); ..."` exits 0 — `meta.schema` is array, `meta.messages.zustandInWorklet` present.
- **RuleTester:** `cd mobile && node eslint-rules/__tests__/no-zustand-in-worklet.test.js` exits 0; all 6 fixtures pass.
- **Synthetic-violation gate:** Wrote a `.tsx` file inside `mobile/` importing `useStore` from `./stores/useStore` and calling it inside a `useAnimatedStyle` arrow with `'worklet'` directive; `npx eslint` reports `mt-bank/no-zustand-in-worklet` with the exact `Worklet body references 'useStore' from Zustand store…` message. Rule fires as designed.
- **Lint preservation:** Running `npm run lint` against the config WITHOUT my new entry vs WITH it produces identical error/warning counts (117 problems, 17 errors, 100 warnings) — none of the 17 errors come from `mt-bank/no-zustand-in-worklet`. The new rule introduces zero violations on the existing tree.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Scope Notes

**1. [Out of scope] `npm run lint` exits 1 on the current tree (17 pre-existing errors)**

- **Found during:** Task 3 verification.
- **Issue:** The plan's acceptance criterion `cd mobile && npm run lint --silent` (exit 0) cannot pass on this branch — `npm run lint` already exits 1 from 17 pre-existing errors in test files (`__tests__/store-errors.test.ts`, `components/__tests__/payment-error-split.test.tsx`, `services/__tests__/refresh401.test.ts`, etc.) that are unrelated to Phase 5.
- **Investigation:** Restored the original `eslint.config.js` (without my rule), re-ran `npm run lint` → identical output: `117 problems (17 errors, 100 warnings)`. The errors are entirely pre-existing — `no-undef` for `jest`/`describe`/`expect` in test files, `import/namespace` in store tests, `react/no-unescaped-entities` — none from `mt-bank/no-zustand-in-worklet`.
- **Decision:** Per executor scope rules (`Pre-existing warnings, linting errors, or failures in unrelated files are out of scope`), these are NOT auto-fixed in this plan. The new rule itself is correct and does not regress lint.
- **Tracked for:** A future cleanup plan (likely a Phase-5/-9 lint-debt sweep). Logged here for visibility; the synthetic-violation gate proves the rule is wired and effective regardless of the unrelated test-file lint debt.

### Worktree-Routing Note

Initial Bash invocations targeted the main repo path (`/Users/.../gm-bank-app/mobile`) rather than the worktree path due to a `cd /Users/.../gm-bank-app/...` prefix landing outside the worktree. The two task commits were re-applied via `git cherry-pick` onto the worktree branch; the worktree branch HEAD now contains all three commits in order. No code lost; no double-application risk because content-identical commits cherry-pick cleanly.

Symlink `mobile/node_modules -> ../../../mobile/node_modules` was created inside the worktree to allow ESLint runs (the worktree had no installed deps — see Phase-5 plan 02 for the same approach if applicable). The symlink is untracked (`mobile/node_modules` is gitignored project-wide).

## Auth Gates

None.

## Known Stubs

None — the rule, its tests, and its registration are all production-grade.

## Acceptance Criteria

- [x] Custom rule `mt-bank/no-zustand-in-worklet` ships at error severity.
- [x] Rule fires on `'worklet'` directive functions referencing `useStore` / `useShallow` / any name imported from a `stores/` module.
- [x] Rule fires on arrow functions assigned to a const and passed to `useAnimatedStyle` / `useDerivedValue` / etc., when the body has the `'worklet'` directive (Pitfall 5).
- [x] RuleTester self-test (5+ fixtures: D-11 a/c, useShallow re-export, Pitfall 5, plus 2 valid) passes via `node` CLI.
- [x] Synthetic violation surfaces `mt-bank/no-zustand-in-worklet` from `npx eslint`. (Note: `npm run lint --silent` cannot exit 0 on the current tree due to pre-existing unrelated errors — see Scope Notes.)
- [x] All Phase-2 D-25 + Phase-4 D-08 lint entries preserved verbatim.

## Self-Check: PASSED

- File `mobile/eslint-rules/no-zustand-in-worklet.js` exists.
- File `mobile/eslint-rules/__tests__/no-zustand-in-worklet.test.js` exists.
- File `mobile/eslint.config.js` modified (rule wired).
- Commits on worktree branch: `6daab18` (rule), `017814a` (test), `4fcc751` (config wire).
- Synthetic-violation gate confirmed rule fires with the correct messageId.
