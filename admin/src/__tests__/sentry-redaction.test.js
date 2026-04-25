/**
 * Sentry admin redaction tests — parity contract with backend/mobile.
 * Reference: 01-RESEARCH §5.2 + §5.8 + 01-VALIDATION row 1-04-01 (admin arm).
 *
 * The 14 cases below mirror backend/tests/sentry-redaction.test.js and
 * mobile/__tests__/sentry-redaction.test.ts case-for-case. If you add a case
 * here, add the same case to the other two suites — drift breaks the parity
 * contract per the Phase-1 locked decision.
 */
import { describe, test, expect, vi } from 'vitest';

// Mock @sentry/react to prevent Sentry.init side-effects during test load
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  ErrorBoundary: ({ children }) => children,
}));

const { piiBeforeSend, scrubObject } = await import('../sentry.js');

describe('admin piiBeforeSend — request paths', () => {
  test('redacts request.data forbidden fields, preserves benign', () => {
    const ev = piiBeforeSend({
      request: { data: { phone: '+79001234567', pin: '1234', cardNumber: '4111111111111111' } },
    });
    expect(ev.request.data.pin).toBe('[REDACTED]');
    expect(ev.request.data.cardNumber).toBe('[REDACTED]');
    expect(ev.request.data.phone).toBe('+79001234567');
  });

  test('redacts request.headers Authorization + Cookie', () => {
    const ev = piiBeforeSend({
      request: { headers: { Authorization: 'Bearer eyJabc.def.ghi', Cookie: 'session=abc', 'X-Other': 'safe' } },
    });
    expect(ev.request.headers.Authorization).toBe('[REDACTED]');
    expect(ev.request.headers.Cookie).toBe('[REDACTED]');
    expect(ev.request.headers['X-Other']).toBe('safe');
  });

  test('replaces request.cookies wholesale', () => {
    const ev = piiBeforeSend({ request: { cookies: { session: 'x' } } });
    expect(ev.request.cookies).toBe('[REDACTED]');
  });
});

describe('admin piiBeforeSend — contexts/extra/user', () => {
  test('scrubs contexts.* nested forbidden fields', () => {
    const ev = piiBeforeSend({ contexts: { user: { password: 's3cret', id: 42 } } });
    expect(ev.contexts.user.password).toBe('[REDACTED]');
    expect(ev.contexts.user.id).toBe(42);
  });

  test('scrubs extra forbidden fields', () => {
    const ev = piiBeforeSend({ extra: { password: 's3cret', okay: true } });
    expect(ev.extra.password).toBe('[REDACTED]');
    expect(ev.extra.okay).toBe(true);
  });

  test('resets user to { id } only', () => {
    const ev = piiBeforeSend({
      user: { id: 42, email: 'a@b.c', phone: '+79001234567', ip_address: '1.2.3.4', username: 'alice' },
    });
    expect(ev.user).toEqual({ id: 42 });
  });
});

describe('admin piiBeforeSend — exception + breadcrumbs', () => {
  test('scrubs nested vars in stacktrace frames', () => {
    const ev = piiBeforeSend({
      exception: { values: [{ value: 'x', stacktrace: { frames: [{ vars: { pin: '1234', visible: 'ok' } }] } }] },
    });
    expect(ev.exception.values[0].stacktrace.frames[0].vars.pin).toBe('[REDACTED]');
    expect(ev.exception.values[0].stacktrace.frames[0].vars.visible).toBe('ok');
  });

  test('scrubString strips pin= and refreshToken= from exception value', () => {
    const ev = piiBeforeSend({
      exception: { values: [{ value: 'failed: pin=1234 and refreshToken=RT-abc' }] },
    });
    expect(ev.exception.values[0].value).toMatch(/pin=\[REDACTED\]/i);
    expect(ev.exception.values[0].value).toMatch(/refreshToken=\[REDACTED\]/i);
    expect(ev.exception.values[0].value).not.toMatch(/1234/);
    expect(ev.exception.values[0].value).not.toMatch(/RT-abc/);
  });

  test('scrubs breadcrumbs[].data', () => {
    const ev = piiBeforeSend({ breadcrumbs: [{ data: { authorization: 'Bearer X', other: 'ok' } }] });
    expect(ev.breadcrumbs[0].data.authorization).toBe('[REDACTED]');
    expect(ev.breadcrumbs[0].data.other).toBe('ok');
  });

  test('scrubs breadcrumbs[].message via scrubString', () => {
    const ev = piiBeforeSend({
      breadcrumbs: [{ message: 'token=eyJabc.def.ghi cardNumber=4111111111111111' }],
    });
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_JWT\]/);
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_CARD\]/);
  });
});

describe('admin piiBeforeSend — message string', () => {
  test('scrubString replaces JWT in event.message', () => {
    const ev = piiBeforeSend({ message: 'auth: eyJabc.def.ghi' });
    expect(ev.message).toMatch(/\[REDACTED_JWT\]/);
  });

  test('scrubString replaces 13-19 digit cardNumber in event.message', () => {
    const ev = piiBeforeSend({ message: 'card=4111111111111111' });
    expect(ev.message).toMatch(/\[REDACTED_CARD\]/);
  });
});

describe('admin scrubObject — case + depth', () => {
  test('case-insensitive key match', () => {
    const out = scrubObject({ cardNumber: '4111', CARDNUMBER: '4111', CardNumber: '4111' });
    expect(out.cardNumber).toBe('[REDACTED]');
    expect(out.CARDNUMBER).toBe('[REDACTED]');
    expect(out.CardNumber).toBe('[REDACTED]');
  });

  test('depth>6 short-circuit', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { pin: 'untouched' } } } } } } } };
    const out = scrubObject(deep);
    expect(out.l1.l2.l3.l4.l5.l6.l7).toBeDefined();
  });
});
