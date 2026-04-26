/**
 * Express integration tests for errorNormalizer + notFoundHandler.
 * Builds a minimal app per branch (no global pollution; each describe builds its own).
 * Reference: VALIDATION row 1-07-02, CONTEXT D-10, Risk 8.6 mitigation.
 */
const supertest = require('supertest');
const express = require('express');
const pinoHttp = require('pino-http');
const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');

const { AppError } = require('../src/errors/AppError');
const { errorNormalizer, notFoundHandler } = require('../src/errors/errorNormalizer');
const { logger } = require('../src/logger');

function buildApp(routeRegistration, opts = {}) {
  const app = express();
  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = (existing && typeof existing === 'string') ? existing : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: () => 'silent',
  }));
  app.use(express.json());
  routeRegistration(app);
  app.use(notFoundHandler);
  if (opts.poisoned) {
    // 4-arg poisoned normalizer that fails the test if entered
    app.use((err, _req, res, _next) => {
      res.status(599).json({ poisoned: true, err: err && err.message });
    });
  } else {
    app.use(errorNormalizer);
  }
  return app;
}

describe('errorNormalizer — AppError branch', () => {
  test('throw new AppError(code, status) → body.error=code, body.message=messages[code]', async () => {
    const app = buildApp((a) => {
      a.get('/login', (_req, _res, next) => next(new AppError('AUTH_INVALID_PIN', 401)));
    });
    const res = await supertest(app).get('/login');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_INVALID_PIN');
    expect(res.body.message).toBe('Неверный ПИН-код');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  test('AppError with messageOverride wins over codebook', async () => {
    const app = buildApp((a) => {
      a.get('/x', (_req, _res, next) => next(new AppError('CUSTOM', 422, 'Точное сообщение')));
    });
    const res = await supertest(app).get('/x');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CUSTOM');
    expect(res.body.message).toBe('Точное сообщение');
  });

  test('AppError with unknown code AND no message → falls back to messages.INTERNAL_ERROR', async () => {
    const app = buildApp((a) => {
      // The constructor sets message=code when no override; force the fallback by clearing message.
      a.get('/y', (_req, _res, next) => {
        const e = new AppError('UNKNOWN_CODE', 500);
        e.message = ''; // simulate edge-case: code not in codebook AND no message
        next(e);
      });
    });
    const res = await supertest(app).get('/y');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('UNKNOWN_CODE');
    expect(res.body.message).toBe('Внутренняя ошибка сервера');
  });
});

describe('errorNormalizer — Prisma branch', () => {
  test('PrismaClientKnownRequestError → 500 / DB_ERROR / Russian generic; column-name hint never leaks', async () => {
    const app = buildApp((a) => {
      a.get('/db', (_req, _res, next) => {
        const err = new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          { code: 'P2002', clientVersion: 'test' }
        );
        next(err);
      });
    });
    const res = await supertest(app).get('/db');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB_ERROR');
    expect(res.body.message).toBe('Ошибка базы данных');
    // CRITICAL: Prisma's column-name hint must NOT leak (T-1-03 mitigation)
    expect(JSON.stringify(res.body)).not.toContain('email');
  });

  test('PrismaClientValidationError → 500 / DB_ERROR', async () => {
    const app = buildApp((a) => {
      a.get('/dbv', (_req, _res, next) => {
        const err = new Prisma.PrismaClientValidationError('bad query', { clientVersion: 'test' });
        next(err);
      });
    });
    const res = await supertest(app).get('/dbv');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB_ERROR');
    expect(res.body.message).toBe('Ошибка базы данных');
  });
});

describe('errorNormalizer — VALIDATION_FAILED issues[] propagation (D-10, plan 03-05)', () => {
  test('AppError(VALIDATION_FAILED) with err.issues=[{...}] → response body includes issues[] alongside {error,message,requestId}', async () => {
    const issues = [
      { path: ['amount'], code: 'too_small', message: 'must be > 0' },
      { path: ['phone'], code: 'invalid_string', message: 'bad phone' },
    ];
    const app = buildApp((a) => {
      a.get('/zod', (_req, _res, next) => {
        const e = new AppError('VALIDATION_FAILED', 400);
        e.issues = issues;
        next(e);
      });
    });
    const res = await supertest(app).get('/zod');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('Проверьте введённые данные');
    expect(res.body.issues).toEqual(issues);
    expect(typeof res.body.requestId).toBe('string');
  });

  test('AppError without issues[] → response body has NO issues field (additive only)', async () => {
    const app = buildApp((a) => {
      a.get('/no-issues', (_req, _res, next) => next(new AppError('AUTH_INVALID_PIN', 401)));
    });
    const res = await supertest(app).get('/no-issues');
    expect(res.body.issues).toBeUndefined();
  });

  test('non-array err.issues is ignored (defensive — never serialize non-array)', async () => {
    const app = buildApp((a) => {
      a.get('/bad-issues', (_req, _res, next) => {
        const e = new AppError('VALIDATION_FAILED', 400);
        e.issues = 'not-an-array';
        next(e);
      });
    });
    const res = await supertest(app).get('/bad-issues');
    expect(res.body.issues).toBeUndefined();
  });
});

describe('errorNormalizer — BALANCE_INSUFFICIENT (Postgres 23514, REL-07, Pitfall 9)', () => {
  test('Prisma error w/ driverError.code=23514 + BankAccount_balance_nonneg_check → 400 BALANCE_INSUFFICIENT (NOT DB_ERROR)', async () => {
    const app = buildApp((a) => {
      a.get('/check', (_req, _res, next) => {
        const err = new Prisma.PrismaClientKnownRequestError(
          'new row for relation "BankAccount" violates check constraint "BankAccount_balance_nonneg_check"',
          { code: 'P2010', clientVersion: 'test', meta: { driverError: { code: '23514', message: 'BankAccount_balance_nonneg_check' } } },
        );
        next(err);
      });
    });
    const res = await supertest(app).get('/check');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BALANCE_INSUFFICIENT');
    expect(res.body.message).toBe('Недостаточно средств');
    // Schema/constraint name must NOT leak to client
    expect(JSON.stringify(res.body)).not.toContain('BankAccount_balance_nonneg_check');
    expect(JSON.stringify(res.body)).not.toContain('23514');
  });

  test('Prisma error w/ 23514 in raw message but NOT BankAccount_balance_nonneg_check → falls through to DB_ERROR', async () => {
    const app = buildApp((a) => {
      a.get('/other-check', (_req, _res, next) => {
        const err = new Prisma.PrismaClientKnownRequestError(
          'check constraint "OtherTable_some_check" violated, code 23514',
          { code: 'P2010', clientVersion: 'test' },
        );
        next(err);
      });
    });
    const res = await supertest(app).get('/other-check');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB_ERROR');
  });

  test('PrismaClientUnknownRequestError carrying BankAccount_balance_nonneg_check + 23514 also maps to BALANCE_INSUFFICIENT', async () => {
    const app = buildApp((a) => {
      a.get('/unknown-check', (_req, _res, next) => {
        const err = new Prisma.PrismaClientUnknownRequestError(
          'raw query failed: ERROR: 23514: new row violates check constraint "BankAccount_balance_nonneg_check"',
          { clientVersion: 'test' },
        );
        next(err);
      });
    });
    const res = await supertest(app).get('/unknown-check');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BALANCE_INSUFFICIENT');
  });
});

describe('errorNormalizer — express-validator branch', () => {
  test('err.errors array shape → 400 / VALIDATION_FAILED', async () => {
    const app = buildApp((a) => {
      a.get('/v1', (_req, _res, next) => {
        const err = Object.assign(new Error('vfail'), { errors: [{ msg: 'pin must be 4 digits' }] });
        next(err);
      });
    });
    const res = await supertest(app).get('/v1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('Проверьте введённые данные');
  });

  test('err.array() function shape → 400 / VALIDATION_FAILED', async () => {
    const app = buildApp((a) => {
      a.get('/v2', (_req, _res, next) => {
        const err = Object.assign(new Error('vfail2'), { array: () => [{ msg: 'x' }] });
        next(err);
      });
    });
    const res = await supertest(app).get('/v2');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });
});

describe('errorNormalizer — unknown branch', () => {
  test('plain Error → 500 / INTERNAL_ERROR / Russian generic; raw err.message must NOT leak', async () => {
    const app = buildApp((a) => {
      a.get('/oops', (_req, _res, next) => next(new Error('boom from inside the route')));
    });
    const res = await supertest(app).get('/oops');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Внутренняя ошибка сервера');
    expect(JSON.stringify(res.body)).not.toContain('boom from inside the route');
  });
});

describe('errorNormalizer — stack-trace-never-in-body (T-1-03)', () => {
  test.each([
    ['AppError', () => new AppError('X', 500)],
    ['Prisma', () => new Prisma.PrismaClientKnownRequestError('m', { code: 'P2002', clientVersion: 't' })],
    ['validator', () => Object.assign(new Error('v'), { errors: [] })],
    ['unknown', () => new Error('plain')],
  ])('%s branch → response body has NO stack field', async (_label, makeErr) => {
    const app = buildApp((a) => {
      a.get('/s', (_req, _res, next) => next(makeErr()));
    });
    const res = await supertest(app).get('/s');
    expect(res.body.stack).toBeUndefined();
    expect(res.body.error && res.body.error.stack).toBeUndefined();
    // No frame markers leak into the JSON body
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/at\s+.*\(.*\.js:\d+:\d+\)/);
  });
});

describe('notFoundHandler — 3-arg / returns directly (Risk 8.6)', () => {
  test('unmounted path → 404 with { error: NOT_FOUND, message: Russian, requestId }', async () => {
    const app = buildApp((a) => {
      a.get('/known', (_req, res) => res.json({ ok: true }));
    });
    const res = await supertest(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toBe('Ресурс не найден');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('notFoundHandler does NOT call next — poisoned errorNormalizer is NOT reached', async () => {
    const app = buildApp(
      (a) => { a.get('/known', (_req, res) => res.json({ ok: true })); },
      { poisoned: true }
    );
    const res = await supertest(app).get('/never-routed');
    // If notFoundHandler had called next(err), the poisoned 599 normalizer would have responded.
    expect(res.status).toBe(404);
    expect(res.body.poisoned).toBeUndefined();
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
