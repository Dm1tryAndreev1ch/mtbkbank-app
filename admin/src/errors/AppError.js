/**
 * Phase 3 — Plan 03-16 — SEC-07.
 *
 * Admin-side AppError class. Mirrors backend AppError shape so apiFetch can
 * surface { code, message, status, requestId, issues } without exposing the
 * raw HTTP body to JSX. UI rendering MUST go through formatPageError +
 * codebook lookup — never .message directly.
 */
export class AppError extends Error {
  constructor({ code, message, status, requestId, issues } = {}) {
    super(message || code || 'AppError');
    this.name = 'AppError';
    this.code = code || 'UNKNOWN';
    this.status = status ?? 0;
    this.requestId = requestId || null;
    this.issues = Array.isArray(issues) ? issues : null;
  }
}
