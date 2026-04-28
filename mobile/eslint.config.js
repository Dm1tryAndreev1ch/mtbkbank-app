// mobile/eslint.config.js
// ESLint v9 flat config for mobile/.
//
// Ships D-25 from Phase 2:
//   - Rule A — `no-restricted-imports`: bans `expo-secure-store` import everywhere
//     except `mobile/services/tokenStore.ts` (the sole permitted writer per REL-01).
//   - Rule B — `no-restricted-syntax`: bans `setTimeout` calls inside
//     `mobile/app/login.tsx` (the PIN-screen race fix per REL-03 must stay structural).
//
// Both rules error (not warn). The `lint` npm script runs `eslint . --max-warnings=0`
// so warnings fail the gate too.
//
// NOTE on the file format: ESLint v9 defaults to flat config (`eslint.config.js`).
// The plan PATTERNS.md shows a legacy `.eslintrc.json` shape; this file ports the
// same two rules verbatim into flat config. `eslint-config-expo@10` ships native
// flat-config entry (`eslint-config-expo/flat`). See SUMMARY.md (Deviations) for
// the version mapping rationale.
//
// TIMING: This config ships BEFORE Plans 02-04..02-09. On the existing pre-refactor
// codebase, Rule A errors against direct SecureStore imports in
// services/api.ts, components/BiometricGuard.tsx, stores/useStore.ts, app/index.tsx;
// Rule B errors against the setTimeout in app/login.tsx (line 43). This RED state
// is intentional — Plan 02-99 (verify) gates `npm run lint` exit-0 as the
// phase-completion check.
//
// Phase 5 D-07 — mt-bank/no-zustand-in-worklet (error). Custom AST rule at
// eslint-rules/no-zustand-in-worklet.js blocks worklet bodies from reading
// Zustand. Belt-and-suspenders: scripts/regression-guard.sh greps for the
// same file-level proximity (Phase 5 plan 04). See CLAUDE.md
// "worklets cannot reference Zustand".

const expoConfig = require('eslint-config-expo/flat');
const noZustandInWorklet = require('./eslint-rules/no-zustand-in-worklet');

module.exports = [
  // Files / dirs ESLint should never look at.
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'android/',
      'ios/',
      'dist/',
      'build/',
      '**/__tests__/__snapshots__/',
      'e2e/',
    ],
  },

  // Expo's recommended baseline (RN + React + TypeScript).
  ...expoConfig,

  // Rule A — `no-restricted-imports` project-wide.
  // Override below re-allows the import inside `services/tokenStore.ts`.
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-secure-store',
              message:
                'Do not import expo-secure-store directly — go through services/tokenStore.ts (D-25, REL-01).',
            },
          ],
        },
      ],
    },
  },

  // Override 1: `services/tokenStore.ts` is the SOLE file permitted to import
  // expo-secure-store for AUTH TOKENS. Disable Rule A here.
  {
    files: ['services/tokenStore.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Override 1b: `services/secureStorageUiPrefs.ts` is the SECOND permitted importer of
  // expo-secure-store, scoped to NON-SENSITIVE UI prefs only (theme, cardDesign). Whitelisted
  // by Plan 02-05 alongside its regression-guard.sh path-exclusion. Tokens MUST NOT be written
  // through this file — D-09 + REL-01.
  {
    files: ['services/secureStorageUiPrefs.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Override 2: `app/login.tsx` may NOT call `setTimeout` — the PIN-keypad
  // submit must stay synchronous (D-25, REL-03). The structural fix must
  // not be bypassed by a defensive timeout.
  {
    files: ['app/login.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message:
            'setTimeout is forbidden in login.tsx — keypad submit must be synchronous (D-25, REL-03).',
        },
      ],
    },
  },

  // Phase-4 D-08 — mockup-button + raw-async-onPress hard-gate across mobile/app/.
  //   1. `<X onPress={() => {}}>`           — empty onPress is forbidden.
  //   2. `<X onPress={() => undefined}>`    — explicit no-op is forbidden.
  //   3. `<X onPress={async () => ...}>`    — raw async onPress is forbidden,
  //      EXCEPT on `<ActionButton>` which is the sole permitted async-onPress
  //      consumer (single-flight + offline-aware + rate-limit-aware) per UX-04.
  //
  // AST selector notes:
  //   - `JSXAttribute[value.expression.body.body.length=0]` matches an empty BlockStatement body.
  //   - For raw async we filter at the JSXAttribute level and use a parent-element
  //     `:not(...)` predicate via the JSXOpeningElement parent.
  //
  // Belt-and-suspenders: scripts/regression-guard.sh greps for the same patterns
  // so disabling the lint rule alone does not pass CI.
  {
    files: ['app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='onPress'][value.expression.type='ArrowFunctionExpression'][value.expression.body.type='BlockStatement'][value.expression.body.body.length=0]",
          message:
            'Empty onPress is forbidden — wire the handler, hide the button, or use ActionButton (Phase 4 D-07/D-08).',
        },
        {
          selector:
            "JSXAttribute[name.name='onPress'][value.expression.type='ArrowFunctionExpression'][value.expression.body.type='Identifier'][value.expression.body.name='undefined']",
          message:
            'onPress={() => undefined} is forbidden — wire or remove (Phase 4 D-07/D-08).',
        },
        {
          selector:
            "JSXOpeningElement:not([name.name='ActionButton']) > JSXAttribute[name.name='onPress'][value.expression.type='ArrowFunctionExpression'][value.expression.async=true]",
          message:
            'Raw async onPress is forbidden — use <ActionButton /> (UX-04, Phase 4 D-06/D-08).',
        },
      ],
    },
  },

  // Phase 5 D-07 — mt-bank/no-zustand-in-worklet (custom local rule).
  {
    plugins: { 'mt-bank': { rules: { 'no-zustand-in-worklet': noZustandInWorklet } } },
    rules: { 'mt-bank/no-zustand-in-worklet': 'error' },
  },
];
