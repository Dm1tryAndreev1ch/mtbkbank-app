// backend/src/routes/admin/trades.js
//
// Phase 4.5 / 04.5-01 / D-01 — trades sub-router scaffold.
// Plan owns this domain in a downstream plan; Plan 1 only ships the scaffold.
//
// Auth chain mounted app-level in src/index.js — do NOT remount middleware here.
// Sub-router import convention (Pitfall 2): require the auditLog MODULE,
// not destructure. Plans 2-4 will import withAudit + AUDIT_ACTIONS from this
// module reference when they wire mutations.

const express = require('express');
// auditLog reserved for downstream plans — keeping the import live so the
// regression-guard step (c) (mutation -> withAudit/writeAudit) is exercised
// the moment a Plan-N mutation lands here. Aliased to '_auditLog' so ESLint
// no-unused-vars (if enabled in a future config) does not flag the scaffold.
const _auditLog = require('../../services/auditLog');
void _auditLog;

const router = express.Router();

module.exports = router;
