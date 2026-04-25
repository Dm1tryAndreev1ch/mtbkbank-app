/**
 * Sentry mobile redaction tests — parity contract with backend instrument.js.
 * Reference: RESEARCH §5.2 + §5.7 + VALIDATION row 1-04-01 (mobile arm).
 */
// Mock @sentry/react-native to prevent Sentry.init side-effects during test load
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({ name: 'MobileReplay' })),
}));

import { piiBeforeSend, scrubObject, authUrlBreadcrumbFilter } from '../services/sentry';

describe('mobile piiBeforeSend — request paths', () => {
  test('redacts request.data forbidden fields, preserves benign', () => {
    const ev = piiBeforeSend({
      request: { data: { phone: '+70000000000', pin: '1234', cardNumber: '4111111111111111' } },
    });
    expect(ev.request.data.pin).toBe('[REDACTED]');
    expect(ev.request.data.cardNumber).toBe('[REDACTED]');
    expect(ev.request.data.phone).toBe('+70000000000');
  });

  test('redacts request.headers Authorization + Cookie', () => {
    const ev = piiBeforeSend({
      request: {
        headers: { Authorization: 'Bearer eyJabc.def.ghi', Cookie: 'session=abc', 'X-Other': 'safe' },
      },
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

describe('mobile piiBeforeSend — contexts/extra/user', () => {
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
      user: { id: 42, email: 'a@b.c', phone: '+70000000000', ip_address: '1.2.3.4', username: 'alice' },
    });
    expect(ev.user).toEqual({ id: 42 });
  });
});

describe('mobile piiBeforeSend — exception + breadcrumbs', () => {
  test('scrubs nested vars in stacktrace frames', () => {
    const ev = piiBeforeSend({
      exception: {
        values: [{ value: 'x', stacktrace: { frames: [{ vars: { pin: '1234', visible: 'ok' } }] } }],
      },
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
    // Note: scrubString applies the key=value regex BEFORE the bare-digits regex,
    // so `cardNumber=4111...` becomes `cardNumber=[REDACTED]` (not `[REDACTED_CARD]`).
    // A bare 16-digit run (no `cardNumber=` prefix) still hits `[REDACTED_CARD]`.
    const ev = piiBeforeSend({
      breadcrumbs: [
        { message: 'token=eyJabc.def.ghi cardNumber=4111111111111111 raw=4242424242424242' },
      ],
    });
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_JWT\]/);
    expect(ev.breadcrumbs[0].message).toMatch(/cardNumber=\[REDACTED\]/);
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_CARD\]/);
    expect(ev.breadcrumbs[0].message).not.toMatch(/4111/);
    expect(ev.breadcrumbs[0].message).not.toMatch(/4242/);
  });
});

describe('mobile scrubObject — case + depth', () => {
  test('case-insensitive key match', () => {
    const out = scrubObject({ cardNumber: '4111', CARDNUMBER: '4111', CardNumber: '4111' });
    expect(out.cardNumber).toBe('[REDACTED]');
    expect(out.CARDNUMBER).toBe('[REDACTED]');
    expect(out.CardNumber).toBe('[REDACTED]');
  });

  test('depth>6 short-circuit', () => {
    const deep: any = {
      l1: { l2: { l3: { l4: { l5: { l6: { l7: { pin: 'untouched-at-this-depth' } } } } } } },
    };
    const out = scrubObject(deep);
    expect(out.l1.l2.l3.l4.l5.l6.l7).toBeDefined();
  });
});

describe('mobile authUrlBreadcrumbFilter — auth-URL fetch breadcrumbs', () => {
  test('login URL → body replaced with [REDACTED], URL preserved', () => {
    const bc = {
      category: 'fetch',
      data: { url: 'https://api.example/auth/login', body: '{"phone":"+70000000000","pin":"1234"}', method: 'POST' },
    };
    const out = authUrlBreadcrumbFilter(bc);
    expect(out.data.body).toBe('[REDACTED]');
    expect(out.data.url).toBe('https://api.example/auth/login');
    expect(out.data.method).toBe('POST');
  });

  test('register URL → body redacted', () => {
    const bc = { category: 'fetch', data: { url: '/auth/register', body: '{}' } };
    expect(authUrlBreadcrumbFilter(bc).data.body).toBe('[REDACTED]');
  });

  test('refresh URL → body redacted', () => {
    const bc = { category: 'fetch', data: { url: 'https://api.x/auth/refresh', body: 'rt' } };
    expect(authUrlBreadcrumbFilter(bc).data.body).toBe('[REDACTED]');
  });

  test('non-auth URL passes through unchanged', () => {
    const bc = { category: 'fetch', data: { url: '/api/cards', body: '{"deck":"x"}' } };
    expect(authUrlBreadcrumbFilter(bc).data.body).toBe('{"deck":"x"}');
  });

  test('non-fetch category to /auth/login passes through unchanged', () => {
    const bc = { category: 'navigation', data: { url: '/auth/login' } };
    expect(authUrlBreadcrumbFilter(bc)).toEqual(bc);
  });
});
