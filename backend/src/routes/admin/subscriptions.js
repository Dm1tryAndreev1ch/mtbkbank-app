// backend/src/routes/admin/subscriptions.js
//
// Phase 4.5 / 04.5-01 / D-01 — subscriptions sub-router scaffold.
// Plan 2 owns this domain and ships the actual CRUD endpoints.
//
// Auth chain mounted app-level in src/index.js — do NOT remount middleware here.
// Sub-router import convention (Pitfall 2): require the auditLog MODULE, not destructure.

const express = require('express');
// eslint-disable-next-line no-unused-vars
const auditLog = require('../../services/auditLog');
const router = express.Router();

module.exports = router;
