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

const expoConfig = require('eslint-config-expo/flat');

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
  // expo-secure-store. Disable Rule A here.
  {
    files: ['services/tokenStore.ts'],
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
];
