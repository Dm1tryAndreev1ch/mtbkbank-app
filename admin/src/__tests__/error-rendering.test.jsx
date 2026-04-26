/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-07 scaffold.
 *
 * Admin typed-error rendering: AppError thrown by apiFetch, formatPageError
 * codebook lookup, max-length cap. it.todo until plan 03-16 lands.
 */
import { describe, it } from 'vitest';

describe('admin error rendering (SEC-07)', () => {
  it.todo('apiFetch on non-OK throws AppError with { code, message, status, requestId, issues }');
  it.todo('formatPageError(AppError{ code: AUTH_INVALID_CREDENTIALS }) returns the Russian codebook string «Неверный телефон или ПИН-код»');
  it.todo('formatPageError(AppError{ code: VALIDATION_FAILED, issues: [{path:[amount]}] }) appends the field path');
  it.todo('unknown AppError code falls through to GENERIC Russian fallback');
  it.todo('rendered error string is ≤240 chars even when backend message is long');
  it.todo('admin/src/App.jsx contains no String(e?.message) interpolation that reaches JSX');
});
