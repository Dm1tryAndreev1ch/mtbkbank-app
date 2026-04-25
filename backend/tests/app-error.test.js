/**
 * AppError + messages codebook unit tests.
 * Reference: VALIDATION row 1-07-01 + RESEARCH §6.4 + CONTEXT D-05..D-09.
 */
const { AppError } = require('../src/errors/AppError');
const messages = require('../src/errors/messages');
const errorsModule = require('../src/errors/AppError');

describe('AppError class shape (D-08 single class, no subclasses)', () => {
  test('constructs with (code, status) — message defaults to code', () => {
    const e = new AppError('AUTH_INVALID_PIN', 401);
    expect(e.code).toBe('AUTH_INVALID_PIN');
    expect(e.status).toBe(401);
    expect(e.message).toBe('AUTH_INVALID_PIN');
  });

  test('constructs with (code, status, messageOverride)', () => {
    const e = new AppError('CUSTOM', 422, 'Точное сообщение');
    expect(e.code).toBe('CUSTOM');
    expect(e.status).toBe(422);
    expect(e.message).toBe('Точное сообщение');
  });

  test('every instance has isAppError === true', () => {
    expect(new AppError('X', 500).isAppError).toBe(true);
  });

  test('instanceof Error === true', () => {
    expect(new AppError('X', 500) instanceof Error).toBe(true);
  });

  test('name === "AppError"', () => {
    expect(new AppError('X', 500).name).toBe('AppError');
  });

  test('module exports only { AppError } — no AuthError/ValidationError subclasses', () => {
    expect(Object.keys(errorsModule).sort()).toEqual(['AppError']);
  });
});

describe('messages codebook (D-05/D-06)', () => {
  const REQUIRED_CODES = [
    'AUTH_INVALID_PIN',
    'AUTH_USER_NOT_FOUND',
    'AUTH_TOKEN_INVALID',
    'AUTH_TOKEN_EXPIRED',
    'AUTH_FORBIDDEN',
    'BALANCE_INSUFFICIENT',
    'DECK_VALIDATION_FAILED',
    'RATE_LIMIT_EXCEEDED',
    'VALIDATION_FAILED',
    'DB_ERROR',
    'NOT_FOUND',
    'INTERNAL_ERROR',
  ];

  test.each(REQUIRED_CODES)('codebook contains required code %s', (code) => {
    expect(messages[code]).toBeTruthy();
    expect(typeof messages[code]).toBe('string');
  });

  test('all values contain Cyrillic (Russian copy)', () => {
    for (const [, value] of Object.entries(messages)) {
      expect(value).toMatch(/[А-Яа-яЁё]/);
    }
  });

  test('all keys are uppercase snake_case', () => {
    for (const code of Object.keys(messages)) {
      expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    }
  });

  test('no parameter substitution placeholders ({ or %s)', () => {
    for (const value of Object.values(messages)) {
      expect(value).not.toMatch(/\{/);
      expect(value).not.toMatch(/%s/);
    }
  });
});
