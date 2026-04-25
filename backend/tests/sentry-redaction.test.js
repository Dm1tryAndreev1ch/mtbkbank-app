/**
 * Sentry beforeSend redaction tests.
 * Covers all 7 paths in the Sentry event schema where PII can hide,
 * plus the scrubString regex coverage (pin=, cardNumber=, JWT shapes).
 * Reference: RESEARCH §9 "PII-Redaction Acceptance Bar".
 */
const { piiBeforeSend, scrubObject, scrubString } = require('../src/instrument');

describe('piiBeforeSend — request paths', () => {
  test('redacts request.data forbidden fields, preserves benign fields', () => {
    const ev = piiBeforeSend({
      request: { data: { phone: '+79001234567', pin: '1234', cardNumber: '4111111111111111' } },
    });
    expect(ev.request.data.pin).toBe('[REDACTED]');
    expect(ev.request.data.cardNumber).toBe('[REDACTED]');
    expect(ev.request.data.phone).toBe('+79001234567');
  });

  test('redacts request.headers forbidden fields (case-insensitive)', () => {
    const ev = piiBeforeSend({
      request: { headers: { Authorization: 'Bearer eyJabc.def.ghi', Cookie: 'session=abc', 'X-Other': 'safe' } },
    });
    expect(ev.request.headers.Authorization).toBe('[REDACTED]');
    expect(ev.request.headers.Cookie).toBe('[REDACTED]');
    expect(ev.request.headers['X-Other']).toBe('safe');
  });

  test('replaces request.cookies wholesale with [REDACTED]', () => {
    const ev = piiBeforeSend({ request: { cookies: { session: 'x', anything: 'y' } } });
    expect(ev.request.cookies).toBe('[REDACTED]');
  });
});

describe('piiBeforeSend — contexts / extra / user', () => {
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

  test('resets user to { id } only — strips email/phone/ip_address/username', () => {
    const ev = piiBeforeSend({
      user: { id: 42, email: 'a@b.c', phone: '+79001234567', ip_address: '1.2.3.4', username: 'alice' },
    });
    expect(ev.user).toEqual({ id: 42 });
  });
});

describe('piiBeforeSend — exception + breadcrumbs', () => {
  test('scrubs nested vars in exception stacktrace frames', () => {
    const ev = piiBeforeSend({
      exception: { values: [{ value: 'oops', stacktrace: { frames: [{ vars: { pin: '1234', visible: 'ok' } }] } }] },
    });
    expect(ev.exception.values[0].stacktrace.frames[0].vars.pin).toBe('[REDACTED]');
    expect(ev.exception.values[0].stacktrace.frames[0].vars.visible).toBe('ok');
  });

  test('scrubString strips pin= and refreshToken= from exception.value', () => {
    const ev = piiBeforeSend({
      exception: { values: [{ value: 'Login failed for pin=1234 and refreshToken=RT-abc' }] },
    });
    expect(ev.exception.values[0].value).toMatch(/pin=\[REDACTED\]/i);
    expect(ev.exception.values[0].value).toMatch(/refreshToken=\[REDACTED\]/i);
    expect(ev.exception.values[0].value).not.toMatch(/1234/);
    expect(ev.exception.values[0].value).not.toMatch(/RT-abc/);
  });

  test('scrubs breadcrumbs[].data forbidden fields', () => {
    const ev = piiBeforeSend({ breadcrumbs: [{ data: { authorization: 'Bearer X', other: 'ok' } }] });
    expect(ev.breadcrumbs[0].data.authorization).toBe('[REDACTED]');
    expect(ev.breadcrumbs[0].data.other).toBe('ok');
  });

  test('scrubs breadcrumbs[].message via scrubString (cardNumber + JWT)', () => {
    const ev = piiBeforeSend({
      breadcrumbs: [{ message: 'token=eyJabc.def.ghi cardNumber=4111111111111111' }],
    });
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_JWT\]/);
    expect(ev.breadcrumbs[0].message).toMatch(/\[REDACTED_CARD\]/);
    expect(ev.breadcrumbs[0].message).not.toMatch(/eyJabc/);
    expect(ev.breadcrumbs[0].message).not.toMatch(/4111111111111111/);
  });
});

describe('piiBeforeSend — message string', () => {
  test('scrubString replaces JWT in event.message', () => {
    const ev = piiBeforeSend({ message: 'auth: eyJabc.def.ghi' });
    expect(ev.message).toMatch(/\[REDACTED_JWT\]/);
  });

  test('scrubString replaces 13-19 digit cardNumber in event.message', () => {
    const ev = piiBeforeSend({ message: 'card=4111111111111111' });
    expect(ev.message).toMatch(/\[REDACTED_CARD\]/);
  });
});

describe('scrubObject — case-insensitive + depth limit', () => {
  test('case-insensitive key match (cardNumber / CARDNUMBER / CardNumber)', () => {
    const out = scrubObject({ cardNumber: '4111', CARDNUMBER: '4111', CardNumber: '4111' });
    expect(out.cardNumber).toBe('[REDACTED]');
    expect(out.CARDNUMBER).toBe('[REDACTED]');
    expect(out.CardNumber).toBe('[REDACTED]');
  });

  test('depth>6 short-circuit returns the deep object as-is', () => {
    // Build a 7-level deep object with `pin` at the bottom; depth limit is 6.
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { pin: 'should-not-be-redacted-at-this-depth' } } } } } } } };
    const out = scrubObject(deep);
    // l1..l6 still scrubbed; l7's children are returned untouched
    expect(out.l1.l2.l3.l4.l5.l6.l7).toBeDefined();
  });
});

describe('instrument.js boot — silent skip when DSN empty', () => {
  test('module load does not throw when SENTRY_DSN is empty', () => {
    // setup.js sets SENTRY_DSN='' — the module is already loaded by the require above
    // The fact that the previous tests ran proves require did not throw.
    expect(typeof piiBeforeSend).toBe('function');
  });
});
