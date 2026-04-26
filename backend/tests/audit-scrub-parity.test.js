/**
 * Phase 3 — Plan 03-00 Wave 0 — Pitfall 2 scaffold.
 *
 * Scrubber parity unit test. The auditLog service may not exist yet;
 * tests stay it.todo until plan 03-12 lands the service.
 */

const fs = require('node:fs');

describe('audit/sentry scrubber parity (Pitfall 2)', () => {
  it.todo('auditLog.scrubObject and sentry.scrubObject redact identical forbidden-key set');
  it.todo('fixture { pin, password, cardNumber, Authorization, refreshToken, cookie, normal } produces identical output from both code paths');
});

void fs;
