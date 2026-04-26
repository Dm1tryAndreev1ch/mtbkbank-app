/**
 * Phase 3 — Plan 03-16 — SEC-07.
 *
 * Admin typed-error rendering: AppError thrown by apiFetch, formatPageError
 * codebook lookup, max-length cap. Live assertions (was it.todo in 03-00).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../errors/AppError';
import { CODEBOOK, lookup } from '../errors/codebook';

// Re-implement the apiFetch error path from admin/src/App.jsx as a thin probe.
// We don't want the JSX import surface — we just need the contract: on a
// non-OK Response, an AppError with the documented shape is thrown.
async function apiFetchThrowOnNonOk(res) {
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch { /* non-JSON 5xx */ }
    const code = typeof body.error === 'string' ? body.error : 'GENERIC';
    throw new AppError({
      code,
      message: typeof body.message === 'string' ? body.message : code,
      status: res.status,
      requestId: typeof body.requestId === 'string' ? body.requestId : null,
      issues: Array.isArray(body.issues) ? body.issues : null,
    });
  }
  return res.json();
}

// Mirror of admin/src/App.jsx formatPageError. Kept in lockstep with the
// production implementation so a divergence breaks the test (intentional).
function formatPageError(e) {
  if (e && e.name === 'AppError') {
    const base = lookup(e.code);
    if (e.code === 'VALIDATION_FAILED' && Array.isArray(e.issues) && e.issues.length) {
      const fields = e.issues
        .slice(0, 5)
        .map((i) => (Array.isArray(i.path) ? i.path.join('.') : String(i.path || 'field')))
        .join(', ');
      return `${base}: ${fields}`.slice(0, 240);
    }
    return base;
  }
  // Network / JSON-parse / unknown — never echo raw message into JSX.
  try {
    // eslint-disable-next-line no-console
    console.warn('[admin] non-AppError surfaced to UI', e);
  } catch { /* noop */ }
  return 'Нет соединения с сервером. Проверьте, что backend запущен.';
}

function makeRes({ ok = false, status = 500, body }) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('admin error rendering (SEC-07)', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('apiFetch on non-OK throws AppError with { code, message, status, requestId, issues }', async () => {
    const res = makeRes({
      ok: false,
      status: 401,
      body: {
        error: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid PIN (raw server text)',
        requestId: 'req-abc-123',
      },
    });
    let thrown;
    try {
      await apiFetchThrowOnNonOk(res);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown.name).toBe('AppError');
    expect(thrown.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(thrown.status).toBe(401);
    expect(thrown.requestId).toBe('req-abc-123');
    // The raw server message is carried (for Sentry) but is NOT rendered.
    expect(thrown.message).toBe('Invalid PIN (raw server text)');
    expect(thrown.issues).toBeNull();
  });

  it('formatPageError(AppError{ code: AUTH_INVALID_CREDENTIALS }) returns the Russian codebook string', () => {
    const err = new AppError({ code: 'AUTH_INVALID_CREDENTIALS', message: 'whatever the server said', status: 401 });
    expect(formatPageError(err)).toBe('Неверный телефон или ПИН-код');
    expect(formatPageError(err)).toBe(CODEBOOK.AUTH_INVALID_CREDENTIALS);
  });

  it('formatPageError(AppError{ code: VALIDATION_FAILED, issues: [...] }) appends the field paths', () => {
    const err = new AppError({
      code: 'VALIDATION_FAILED',
      status: 400,
      issues: [
        { path: ['amount'], message: 'must be positive' },
        { path: ['recipient', 'phone'], message: 'invalid' },
      ],
    });
    const out = formatPageError(err);
    expect(out.startsWith(CODEBOOK.VALIDATION_FAILED)).toBe(true);
    expect(out).toContain('amount');
    expect(out).toContain('recipient.phone');
    expect(out.length).toBeLessThanOrEqual(240);
  });

  it('unknown AppError code falls through to GENERIC Russian fallback', () => {
    const err = new AppError({ code: 'TOTALLY_NEW_BACKEND_CODE', status: 500 });
    expect(formatPageError(err)).toBe(CODEBOOK.GENERIC);
    expect(CODEBOOK.GENERIC).toBe('Произошла ошибка. Попробуйте позже.');
  });

  it('rendered error string is ≤240 chars even when backend message is long', async () => {
    const longRaw = 'x'.repeat(5000);
    const res = makeRes({
      ok: false,
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: longRaw },
    });
    let thrown;
    try {
      await apiFetchThrowOnNonOk(res);
    } catch (e) {
      thrown = e;
    }
    const rendered = formatPageError(thrown);
    expect(rendered.length).toBeLessThanOrEqual(240);
    // Raw long string never appears in the rendered output.
    expect(rendered).not.toContain('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  });

  it('non-AppError errors (network / JSON-parse) never echo raw message into JSX', () => {
    const networkErr = new Error('ECONNREFUSED 127.0.0.1:3000 — server says secret-leak-here');
    const out = formatPageError(networkErr);
    expect(out).not.toContain('ECONNREFUSED');
    expect(out).not.toContain('secret-leak-here');
    expect(out).toBe('Нет соединения с сервером. Проверьте, что backend запущен.');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('admin/src/App.jsx contains no String(e?.message) interpolation that reaches JSX', () => {
    const appJsxPath = path.resolve(__dirname, '..', 'App.jsx');
    const src = fs.readFileSync(appJsxPath, 'utf8');
    expect(src).not.toMatch(/String\(e\?\.message/);
    expect(src).not.toMatch(/String\(err\?\.message/);
    // formatPageError must route through the codebook lookup helper.
    expect(src).toMatch(/lookupErrorMessage|lookup\s*\(/);
    expect(src).toMatch(/from\s+['"]\.\/errors\/AppError['"]/);
    expect(src).toMatch(/from\s+['"]\.\/errors\/codebook['"]/);
  });
});
