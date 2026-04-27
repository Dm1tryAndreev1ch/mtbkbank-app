// Phase 4.5 / 04.5-01 / D-01 — Admin limits sub-router (Plan 1 skeleton).
//
// Plan 2 owns this domain — fills the routes here as part of the cluster
// vertical (backend route + admin page + tests + audit wiring per ADMIN-XX).
//
// Auth chain (authMiddleware → adminMiddleware → requireFreshAdmin →
// adminDestructiveLimiter) is mounted app-level in src/index.js.
// Sub-routers MUST NOT remount auth middleware (Phase-4.5 D-01).

const express = require('express');
// eslint-disable-next-line no-unused-vars
const auditLog = require('../../services/auditLog');
// eslint-disable-next-line no-unused-vars
const { reqValidator } = require('../../middleware/reqValidator');
// eslint-disable-next-line no-unused-vars
const { AppError } = require('../../errors/AppError');
// eslint-disable-next-line no-unused-vars
const { logger } = require('../../logger');
const router = express.Router();

module.exports = router;
