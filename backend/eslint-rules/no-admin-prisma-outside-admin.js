// backend/eslint-rules/no-admin-prisma-outside-admin.js
//
// Phase 4.5 / 04.5-01 / D-02 — placeholder.
//
// The actual rule implementation lives in backend/eslint.config.js as
// `no-restricted-syntax` selectors (mirrors the mobile/ flat-config pattern
// from Phase-4 D-08). This file is reserved in case a future phase migrates
// to a plugin-style rule with a richer AST visitor (e.g., to detect raw
// `tx.user.delete` inside a `prisma.$transaction` closure).
//
// Kept intentionally empty so the directory layout matches CONTEXT
// `<files_modified>` while the source of truth stays in eslint.config.js.

module.exports = {};
