/**
 * Logger redaction tests — proves pino redact paths strip every
 * forbidden field at any nesting depth, replaced with [REDACTED].
 *
 * Pinning OBS-01 (CLAUDE.md): pin, password, cardNumber, Authorization,
 * refreshToken must NEVER appear in plaintext in any log line.
 */
const pino = require('pino');
const { logger, FORBIDDEN_PATHS } = require('../src/logger');

/**
 * Capture pino's stdout output for a single log call by attaching a custom
 * destination stream to a freshly-built logger that mirrors the production
 * redact configuration. We don't reuse `logger` directly because the dev
 * transport pipes to a worker — capturing stdout from the worker requires
 * re-wiring stdout itself, which is brittle in Jest.
 */
function captureNext(_loggerInstance, fn) {
  const chunks = [];
  const stream = {
    write: (chunk) => {
      chunks.push(chunk);
    },
  };
  const child = pino(
    {
      level: 'trace',
      redact: { paths: FORBIDDEN_PATHS, censor: '[REDACTED]' },
    },
    stream
  );
  fn(child);
  return chunks.join('');
}

describe('logger redaction (FORBIDDEN_PATHS)', () => {
  test('redacts top-level pin', () => {
    const out = captureNext(logger, (l) => l.info({ pin: '1234' }, 'login attempt'));
    expect(out).toContain('"pin":"[REDACTED]"');
    expect(out).not.toContain('"1234"');
  });

  test('redacts top-level password', () => {
    const out = captureNext(logger, (l) => l.info({ password: 's3cret' }));
    expect(out).toContain('"password":"[REDACTED]"');
    expect(out).not.toContain('s3cret');
  });

  test('redacts top-level cardNumber', () => {
    const out = captureNext(logger, (l) =>
      l.info({ cardNumber: '4111111111111111' })
    );
    expect(out).toContain('"cardNumber":"[REDACTED]"');
    expect(out).not.toContain('4111111111111111');
  });

  test('redacts top-level refreshToken', () => {
    const out = captureNext(logger, (l) => l.info({ refreshToken: 'rt-abc' }));
    expect(out).toContain('"refreshToken":"[REDACTED]"');
    expect(out).not.toContain('rt-abc');
  });

  test('redacts nested *.password via wildcard', () => {
    const out = captureNext(logger, (l) =>
      l.info({ user: { password: 's3cret', name: 'Alice' } })
    );
    expect(out).toContain('"password":"[REDACTED]"');
    expect(out).toContain('"name":"Alice"');
    expect(out).not.toContain('s3cret');
  });

  test('redacts nested *.cardNumber via wildcard', () => {
    const out = captureNext(logger, (l) =>
      l.info({ data: { cardNumber: '4111111111111111' } })
    );
    expect(out).toContain('"cardNumber":"[REDACTED]"');
    expect(out).not.toContain('4111111111111111');
  });

  test('redacts nested *.authorization via wildcard', () => {
    const out = captureNext(logger, (l) =>
      l.info({ headers: { authorization: 'Bearer eyJabc.def.ghi' } })
    );
    expect(out).toContain('"authorization":"[REDACTED]"');
    expect(out).not.toContain('eyJabc.def.ghi');
  });

  test('non-forbidden fields pass through unchanged', () => {
    const out = captureNext(logger, (l) => l.info({ ok: true, count: 42 }));
    expect(out).toContain('"ok":true');
    expect(out).toContain('"count":42');
  });

  test('FORBIDDEN_PATHS includes all five core forbidden fields', () => {
    const fields = FORBIDDEN_PATHS.join(',').toLowerCase();
    expect(fields).toMatch(/\bpin\b/);
    expect(fields).toMatch(/\bpassword\b/);
    expect(fields).toMatch(/\bcardnumber\b/);
    expect(fields).toMatch(/\brefreshtoken\b/);
    expect(fields).toMatch(/\bauthorization\b/);
  });
});
