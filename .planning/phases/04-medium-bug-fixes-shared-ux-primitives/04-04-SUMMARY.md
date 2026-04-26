---
phase: 04-medium-bug-fixes-shared-ux-primitives
plan: 04
subsystem: admin
tags: [admin, ux, validation, zod, primitives, medium-bugs]
dependency-graph:
  requires: [04-01 mobile primitives, 04-02 ESM schema shim]
  provides: [Toast, SkeletonRow, SpinnerButton, ConfirmDialog, useZodForm, schemas barrel]
  affects: [Phase 4.5 admin CRUD — consumers of these primitives]
tech-stack:
  added: [zustand@5 (admin), zod@4 (admin)]
  patterns: [Vite-native Zustand toast queue, onBlur-per-field Zod hook, default-namespace ESM shim over CJS]
key-files:
  created:
    - admin/src/components/Toast.jsx
    - admin/src/components/SkeletonRow.jsx
    - admin/src/components/SpinnerButton.jsx
    - admin/src/components/ConfirmDialog.jsx
    - admin/src/lib/useZodForm.js
    - admin/src/lib/schemas.js
    - admin/src/__tests__/zodValidation.test.jsx
    - admin/src/__tests__/SkeletonRow.test.jsx
    - admin/src/__tests__/SpinnerButton.test.jsx
  modified:
    - admin/src/App.jsx
    - admin/package.json
    - admin/package-lock.json
    - backend/src/schemas/index.mjs
decisions:
  - Vite-native Zustand toast queue (capped at 5) over Context API — selector-based subscribers + getState() for non-component callsites.
  - useZodForm runs schema.safeParse on the WHOLE form on blur, then filters issues by path[0] === field — simpler than schema.shape introspection and works uniformly with z.object/z.coerce.
  - Russian-copy mapper (mapZodMessage) handles Zod 4 `origin`/`type` divergence; falls back to backend message (also Russian, Phase-3 codebook).
  - ESM shim switched from createRequire to `import * as` namespace import so it works in BOTH Node (backend tests) AND Vite/Rollup (admin build). createRequire pulled in node:module which Rollup cannot externalize for browser bundles.
  - CardsPage destructive delete now flows through ConfirmDialog (replaces native confirm()).
metrics:
  duration: ~25min
  completed: 2026-04-26
  tasks: 2/2
  tests: 44/44 vitest green (3 new Phase-4 suites + 4 carry-forward)
  build: vite build OK (Rollup CJS-interop warnings only — runtime values verified)
---

# Phase 4 Plan 04: Admin MEDIUM Bug Fixes + Vite-Native UX Primitives Summary

**One-liner:** Closed 5 admin MEDIUM bugs (A-M1..A-M5) by shipping Vite-native primitives (Toast, SkeletonRow, SpinnerButton, ConfirmDialog) and a useZodForm hook that re-uses backend Zod schemas via the ESM shim — no schema duplication, drift impossible by construction.

## Bugs Closed

| ID    | Site                              | Fix                                                                                                                          |
| ----- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A-M1  | App.jsx LoginPage + Users + Cards forms | All form fields driven by `useZodForm`; `onBlur` runs Zod safeParse and renders inline Russian error from `mapZodMessage`.   |
| A-M2  | App.jsx mutation buttons (login, user create/edit, card create, simulate, delete) | Every mutation button is now `<SpinnerButton loading={…}>` — disabled + `aria-label="Выполняется…"` + click swallowed while in-flight. |
| A-M3  | Number inputs (mbPoints, cashback, mbValue, maxHealth) | Admin-local schemas wrap each numeric field in `z.coerce.number().min(0)`. NaN can never reach the API; `'abc'` trips `Введите число`, `'-5'` trips `Значение не может быть отрицательным`. |
| A-M4  | Users + Cards tables              | While `loading && data.length === 0`, tables render `<SkeletonRow columns={N} rows={5} />` (CSS keyframe shimmer, no extra stylesheet). |
| A-M5  | App.jsx:627 theme init            | `useState(readStoredTheme)` → `useState(() => readStoredTheme())`. Explicit lazy initializer documents intent and is robust to future React semantics linting. |

## Schema Reuse Approach

**Chosen:** ESM re-export barrel (`admin/src/lib/schemas.js`) sourced from the Wave-0 ESM shim at `backend/src/schemas/index.mjs`. The shim itself was rewritten in this plan (Rule 1 deviation, see below) to use `import * as auth from './auth.js'` so it works in BOTH Node (backend tests/runtime) and Vite/Rollup (admin browser build).

**Why this over copy/duplicate:** D-15 mandates a single source of truth — changing a backend validation rule must automatically tighten admin without a separate PR. Drift is the failure mode this prevents (T-04-04-01).

**Rationale for `import *` over `import { foo }`:** Rollup's static analysis cannot resolve named exports out of CJS modules (`module.exports = { foo }`). Vite's CJS interop plugin resolves the **namespace** at runtime. `import *` is the lowest-common-denominator that works everywhere; named-export-then-re-export crashes the bundler.

## Russian Copy Landed (UI-SPEC §Admin verbatim)

- `Поле обязательно`
- `Введите число`
- `Значение не может быть отрицательным`
- `Минимум {N} символов` / `Максимум {N} символов`
- `Минимум {N}` / `Максимум {N}` (number bounds)
- `Сохранение выполнено` (success toast on create/edit)
- `Удаление выполнено` (success toast on delete)
- `Выполняется…` (SpinnerButton aria-label)
- `Подтвердите действие` (ConfirmDialog default title)
- `Удалить` / `Отмена` (ConfirmDialog default buttons)
- `Деактивировать карту?` (CardsPage delete confirm)

## Tests

- `admin/src/__tests__/zodValidation.test.jsx` — 5/5 green: too-short string ("Минимум 2 символов"), negative number ("Значение не может быть отрицательным"), NaN coercion ("Введите число"), error-clear-on-edit, undefined ("Поле обязательно").
- `admin/src/__tests__/SkeletonRow.test.jsx` — 2/2 green: explicit rows × columns; default 5×5 prop case.
- `admin/src/__tests__/SpinnerButton.test.jsx` — 4/4 green: loading state, idle state, disabled-passthrough, click-while-loading swallow.
- Total admin vitest run: **44/44 passing** (incl. all 4 carry-forward Phase-3 suites).
- `npm run build` OK (only Rollup CJS-interop warnings — `grantCardSchema is not exported by ../cards.js`; warnings only because Rollup's static analysis doesn't trace `module.exports` keys, but the runtime values come through Vite's CJS plugin and are present in the bundle; verified by grepping the dist JS).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM shim used `createRequire(import.meta.url)` which Vite/Rollup cannot bundle**

- **Found during:** Task 2 first `npm run build` attempt
- **Issue:** The Wave-0 shim at `backend/src/schemas/index.mjs` (created in plan 04-02 Task 4) imported `createRequire` from `node:module`. Vite/Rollup tried to bundle this for the browser, hit `"createRequire" is not exported by "__vite-browser-external"`, and the admin build aborted. The shim is the single hard prerequisite for D-15; without a working shim plan 04-04 cannot ship.
- **Fix:** Rewrote the shim to use `import * as auth from './auth.js'` namespace imports. Vite's built-in CJS interop synthesizes named exports at runtime; Node's ESM-CJS interop does the same statically. Verified both:
  - Node: `node -e "import('./backend/src/schemas/index.mjs').then(m => m.loginSchema.safeParse({phone:'+79001234567',pin:'1234'}))"` → success.
  - Vite: `npm run build` produces `dist/` with the schemas resolved and runtime-correct.
- **Files modified:** `backend/src/schemas/index.mjs`
- **Commit:** fa9a1ef

**2. [Rule 2 - Missing dep] zustand + zod not installed in admin/**

- **Found during:** Task 1 component scaffolding
- **Issue:** Admin's package.json had neither zustand nor zod; the new Toast.jsx (uses `create` from zustand) and useZodForm.js (consumes `z` from zod via the schemas barrel) wouldn't work otherwise.
- **Fix:** `npm install zustand zod` in admin/. Mirrors mobile and backend stacks (no new dependency surface — same versions already in the monorepo).
- **Files modified:** `admin/package.json`, `admin/package-lock.json`
- **Commit:** 0b5618e

**3. [Rule 2 - Missing critical functionality] CardsPage delete used native `confirm()`**

- **Found during:** Task 2 wiring
- **Issue:** Pre-existing code called `if (!confirm('Деактивировать эту карту?')) return;`. Plan listed ConfirmDialog as a deliverable but didn't explicitly require switching CardsPage delete; however leaving the native confirm is inconsistent with the new primitive.
- **Fix:** CardsPage now uses `<ConfirmDialog open={!!confirmDelete} ...>` with destructive red button + Russian copy.
- **Files modified:** `admin/src/App.jsx`
- **Commit:** fa9a1ef

## Self-Check: PASSED

Files exist:
- FOUND: admin/src/components/Toast.jsx
- FOUND: admin/src/components/SkeletonRow.jsx
- FOUND: admin/src/components/SpinnerButton.jsx
- FOUND: admin/src/components/ConfirmDialog.jsx
- FOUND: admin/src/lib/useZodForm.js
- FOUND: admin/src/lib/schemas.js
- FOUND: admin/src/__tests__/zodValidation.test.jsx
- FOUND: admin/src/__tests__/SkeletonRow.test.jsx
- FOUND: admin/src/__tests__/SpinnerButton.test.jsx

Commits exist:
- FOUND: 0b5618e (Task 1 — admin primitives)
- FOUND: fa9a1ef (Task 2 — App.jsx integration + ESM shim browser-safety fix)

Acceptance gates (grep):
- ToastHost mounted: 2 matches (login + authenticated shell)
- SpinnerButton: 5 matches (≥3 required)
- SkeletonRow: 2 matches (≥1 required)
- useZodForm: 4 matches (≥2 required)
- Russian success copy: 4 matches (≥1 required)

Tests: 44/44 vitest passing.
Build: vite build exit 0.
