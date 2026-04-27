// backend/src/routes/admin/trades.js
//
// Phase 4.5 / 04.5-01 / D-01 — trades sub-router scaffold.
// Plan 4 owns this domain and ships the actual CRUD endpoints.
//
// Auth chain mounted app-level in src/index.js — do NOT remount middleware here.
// Sub-router import convention (Pitfall 2): require the auditLog MODULE, not destructure.

const express = require('express');
// eslint-disable-next-line no-unused-vars
const auditLog = require('../../services/auditLog');
const router = express.Router();

module.exports = router;
