/**
 * Admin Sentry init / config wiring assertions.
 * Reference: 01-VALIDATION row 1-06-01 + 01-RESEARCH §5.8.
 *
 * These tests pin the four locked init invariants for the admin SPA:
 *   1. Sentry.init runs only when VITE_SENTRY_DSN is non-empty (silent skip in dev)
 *   2. tracesSampleRate is wired (number)
 *   3. replaysSessionSampleRate === 0 AND replaysOnErrorSampleRate === 0 (D-04)
 *   4. beforeSend is wired to a function (the piiBeforeSend export)
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';

const initSpy = vi.fn();

vi.mock('@sentry/react', () => ({
  init: initSpy,
  captureException: vi.fn(),
  setUser: vi.fn(),
  ErrorBoundary: ({ children }) => children,
}));

describe('Sentry init config (with DSN)', () => {
  let initConfig;

  beforeAll(async () => {
    // Vite's import.meta.env is provided by vitest; stub via vi.stubEnv
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@example.ingest.sentry.io/1');
    // Force fresh module load so the top-level `if (dsn) Sentry.init(...)`
    // evaluates against the stubbed env.
    vi.resetModules();
    await import('../sentry.js');
    expect(initSpy).toHaveBeenCalled();
    initConfig = initSpy.mock.calls[0][0];
  });

  test('dsn passed through', () => {
    expect(initConfig.dsn).toBe('https://example@example.ingest.sentry.io/1');
  });

  test('replaysSessionSampleRate = 0 (admin has no replay)', () => {
    expect(initConfig.replaysSessionSampleRate).toBe(0);
  });

  test('replaysOnErrorSampleRate = 0 (admin has no replay)', () => {
    expect(initConfig.replaysOnErrorSampleRate).toBe(0);
  });

  test('tracesSampleRate present', () => {
    expect(typeof initConfig.tracesSampleRate).toBe('number');
  });

  test('beforeSend wired to a function', () => {
    expect(typeof initConfig.beforeSend).toBe('function');
  });
});

describe('Sentry init guard (no DSN)', () => {
  test('skips init when VITE_SENTRY_DSN is empty', async () => {
    initSpy.mockClear();
    vi.stubEnv('VITE_SENTRY_DSN', '');
    vi.resetModules();
    await import('../sentry.js');
    expect(initSpy).not.toHaveBeenCalled();
  });
});
