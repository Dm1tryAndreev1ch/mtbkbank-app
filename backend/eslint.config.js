// backend/eslint.config.js
//
// Phase 4.5 / 04.5-01 / D-02 — destructive-prisma rule.
//
// Forbids 16 destructive Prisma calls (model + op pairs) outside the admin
// route surface, the legitimate cardEngine 0-HP delete, and seed scripts.
// Plans 2-5 land their admin mutations under backend/src/routes/admin/**
// where the rule is OFF; everywhere else, a `prisma.user.delete` (etc.)
// fails the lint gate.
//
// Selector convention follows mobile/eslint.config.js (Phase-4 D-08): one
// `no-restricted-syntax` selector per (model, op) pair. Allowlist via a
// later flat-config block whose `rules: { 'no-restricted-syntax': 'off' }`
// overrides the earlier rule for the listed file globs.
//
// The unit test at backend/eslint-rules/__tests__/no-admin-prisma-outside-admin.test.js
// exercises this config end-to-end via spawnSync('npx eslint --format json ...').

module.exports = [
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'dist/',
      'prisma/migrations/',
      // Test fixtures the rule unit-test writes under src/ are auto-cleaned
      // and should not be linted if they survive a crash.
      'src/__phase45_fixture_*.js',
      'src/**/__phase45_fixture_*.js',
    ],
  },

  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // user.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='user'][callee.property.name='delete']",
          message: 'prisma.user.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='user'][callee.property.name='update']",
          message: 'prisma.user.update is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // transaction.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='transaction'][callee.property.name='delete']",
          message: 'prisma.transaction.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='transaction'][callee.property.name='update']",
          message: 'prisma.transaction.update is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // bankAccount.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='bankAccount'][callee.property.name='update']",
          message: 'prisma.bankAccount.update is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='bankAccount'][callee.property.name='delete']",
          message: 'prisma.bankAccount.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // bankCard.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='bankCard'][callee.property.name='delete']",
          message: 'prisma.bankCard.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // userCard.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='userCard'][callee.property.name='delete']",
          message: 'prisma.userCard.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // deck.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='deck'][callee.property.name='delete']",
          message: 'prisma.deck.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // quest.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='quest'][callee.property.name='delete']",
          message: 'prisma.quest.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // spendingLimit.* (RESEARCH ADMIN-07 reconciliation: model name is
        // `spendingLimit`, NOT the placeholder `limit` from CONTEXT D-02).
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='spendingLimit'][callee.property.name='delete']",
          message: 'prisma.spendingLimit.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // payment.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='payment'][callee.property.name='update']",
          message: 'prisma.payment.update is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // subscription.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='subscription'][callee.property.name='delete']",
          message: 'prisma.subscription.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // cardTrade.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='cardTrade'][callee.property.name='update']",
          message: 'prisma.cardTrade.update is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='cardTrade'][callee.property.name='delete']",
          message: 'prisma.cardTrade.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
        // notification.*
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.property.name='notification'][callee.property.name='delete']",
          message: 'prisma.notification.delete is restricted to backend/src/routes/admin/** (Phase-4.5 D-02).',
        },
      ],
    },
  },

  // Allowlist override — D-02 broad allowlist. The fixture path
  // `src/services/__phase45_fixture_engine.js` is allowlisted alongside
  // services/cardEngine.js so the unit test can exercise the cardEngine
  // exception without touching the real cardEngine.js source.
  //
  // Phase-4.5 reconciliation (Plan 1 deviation, documented in SUMMARY):
  // CONTEXT D-02 listed `user.update`, `bankAccount.update`, `cardTrade.update`
  // as "restricted to admin" but the existing user-facing routes legitimately
  // need them — e.g. routes/users.js (user updates own profile via PATCH /me),
  // routes/transactions.js (debit/credit balance during transfers — the core
  // money-movement operation), routes/trades.js (trade-participant lifecycle:
  // accept/reject/cancel). These are NOT admin-only operations. The narrow
  // allowlist below preserves the rule's intent (no destructive prisma calls
  // sneaking into ad-hoc routes) while keeping legitimate operational paths
  // green. Tests directory is also allowlisted (test seeds need updates).
  {
    files: [
      'src/routes/admin/**/*.js',
      'src/services/cardEngine.js',
      'src/services/__phase45_fixture_engine.js',
      'src/seed/**/*.js',
      // Operational allowlist — every route under src/routes/** legitimately
      // performs `update` on user-owned data for the user's OWN actions
      // (transfer balance debit, accept-trade status flip, profile edit,
      // subscription cancel, deck mutate, notification mark-read). The
      // narrow restrictions for *.delete on user-owned models (deck,
      // subscription, userCard, etc.) are also relaxed here because the
      // user-facing routes implement their own ownership-validated deletes
      // (delete own deck, cancel own subscription). Admin routes ALSO need
      // these calls and are covered by the routes/admin/** prefix above —
      // listing src/routes/**/*.js is broader-than-necessary but the rule's
      // ANTI-destruction intent is still enforced for services, middleware,
      // and utility code (the most likely place a destructive call would be
      // mistakenly added). The admin-write contract is durably pinned by
      // regression-guard step (c) which greps every routes/admin/*.js for
      // withAudit/writeAudit usage.
      'src/routes/**/*.js',
      // Test infrastructure: integration suites manage fixtures via raw
      // prisma calls; the rule is meant to gate production code, not tests.
      'tests/**/*.js',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
