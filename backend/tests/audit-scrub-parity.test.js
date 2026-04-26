/**
 * Phase 3 — Plan 03-02 — Pitfall 2 parity assertion.
 *
 * Single-source-of-truth pin: auditLog.scrubObject MUST be the SAME function
 * reference as instrument.scrubObject (the Sentry beforeSend redactor). If
 * anyone duplicates the scrubber into the audit service, this identity test
 * fails immediately (D-02 lockstep mandate).
 *
 * Note: Phase 1 named the Sentry init module `backend/src/instrument.js`
 * (not `sentry.js` — the plan's prose used the conceptual name). The real
 * filename is `instrument.js`; D-02 lockstep is enforced against it.
 */

const { scrubObject: auditScrub } = require('../src/services/auditLog');
const { scrubObject: sentryScrub } = require('../src/instrument');

describe('audit/sentry scrubber parity (Pitfall 2)', () => {
  it('auditLog.scrubObject IS instrument.scrubObject (identity — single source of truth)', () => {
    expect(auditScrub).toBe(sentryScrub);
  });

  it('fixture { pin, password, cardNumber, Authorization, refreshToken, cookie, normal } produces identical output from both code paths', () => {
    const fixture = {
      pin: '1234',
      password: 'secret',
      cardNumber: '4111111111111111',
      Authorization: 'Bearer xyz',
      refreshToken: 'rt-token',
      cookie: 'session=abc',
      normal: 'visible',
      nested: { pin: 'inner', ok: 'visible' },
    };
    expect(auditScrub(fixture)).toEqual(sentryScrub(fixture));
    const out = auditScrub(fixture);
    expect(out.pin).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.cardNumber).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.refreshToken).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.normal).toBe('visible');
    expect(out.nested.pin).toBe('[REDACTED]');
    expect(out.nested.ok).toBe('visible');
  });
});
