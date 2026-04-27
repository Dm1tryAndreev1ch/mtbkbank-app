// backend/src/routes/admin/index.js
//
// Phase 4.5 / 04.5-01 / D-01 — sub-router split.
//
// The auth chain (authMiddleware → adminMiddleware → requireFreshAdmin →
// adminDestructiveLimiter) is mounted at the APP LEVEL in src/index.js
// (`app.use('/api/admin', authMiddleware, adminMiddleware, requireFreshAdmin,
// adminDestructiveLimiter, require('./routes/admin'))`).
//
// Sub-routers MUST NOT remount auth middleware. The Phase-4.5 regression-guard
// step (d) greps for `router.use(.*authMiddleware|adminMiddleware|requireFreshAdmin)`
// in every sub-router file and fails the build if any re-mount sneaks in.

const express = require('express');
const router = express.Router();

// Domain sub-routers — Plans 2-5 fill these with their CRUD endpoints. Plan 1
// ships the scaffolds and migrates existing endpoints from the deleted
// singular routes/admin.js.
router.use('/accounts',      require('./accounts'));
router.use('/transactions',  require('./transactions'));
router.use('/bankCards',     require('./bankCards'));
router.use('/userCards',     require('./userCards'));
router.use('/decks',         require('./decks'));
router.use('/quests',        require('./quests'));
router.use('/limits',        require('./limits'));        // → prisma.spendingLimit (NOT prisma.limit)
router.use('/payments',      require('./payments'));
router.use('/subscriptions', require('./subscriptions'));
router.use('/notifications', require('./notifications'));
router.use('/trades',        require('./trades'));
router.use('/users',         require('./users'));

// Dashboard handlers retained at /api/admin/dashboard and /api/admin/dashboard/extended.
const dashboard = require('./dashboard');
router.get('/dashboard',          dashboard.summary);
router.get('/dashboard/extended', dashboard.extended);

// Legacy paths preserved until Plans 2-5 migrate the admin SPA off them.
// /api/admin/cards/* — collection-card templates (lives in bankCards.js).
router.use('/cards', require('./bankCards'));
// /api/admin/grant-card — UserCard grant (lives in userCards.js as grantCardHandler).
router.post('/grant-card', require('./userCards').grantCardHandler);
// /api/admin/simulate-transaction — Transaction simulate (lives in transactions.js).
router.post('/simulate-transaction', require('./transactions').simulateTransactionHandler);

module.exports = router;
