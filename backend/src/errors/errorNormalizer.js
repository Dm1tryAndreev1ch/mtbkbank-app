/**
 * 4-branch error classifier + 3-arg 404 handler.
 * Per D-10: AppError | PrismaClientKnownRequestError|PrismaClientValidationError | express-validator | unknown.
 * Stack trace ONLY in logs — never serialized into HTTP response body, even in NODE_ENV=development.
 *
 * Mount order in backend/src/index.js (per RESEARCH §5.6 + Risk 8.6):
 *   routes → app.use(notFoundHandler) → Sentry.setupExpressErrorHandler(app) → app.use(errorNormalizer)
 */
const { Prisma } = require('@prisma/client');
const { logger } = require('../logger');
const messages = require('./messages');

function notFoundHandler(req, res /* no next on purpose — see Risk 8.6 */) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: messages.NOT_FOUND,
    requestId: req.id,
  });
}

function errorNormalizer(err, req, res, _next) {
  let status;
  let code;
  let message;

  if (err && err.isAppError) {
    status = err.status;
    code = err.code;
    // Precedence: operator-supplied override → Russian codebook → generic INTERNAL_ERROR.
    // The constructor defaults `err.message` to the code itself when no override is given,
    // so we MUST gate on `hasMessageOverride` instead of falsy-checking err.message
    // (otherwise the bare code string would surface to the client instead of Russian copy).
    if (err.hasMessageOverride && err.message) {
      message = err.message;
    } else {
      message = messages[code] || messages.INTERNAL_ERROR;
    }
  } else if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    // Defensive: jest.resetModules + dual require paths can cause instanceof to fail
    // across module-boundary copies of @prisma/client. Fall back to constructor-name
    // matching for the three Prisma error classes — never matches application code.
    (err && err.constructor && /^PrismaClient(Known|Unknown|Validation)RequestError$/.test(err.constructor.name))
  ) {
    // REL-07 / Pitfall 9 (plan 03-05): Postgres 23514 CHECK violation on
    // BankAccount_balance_nonneg_check surfaces either as PrismaClientKnownRequestError
    // (P2010 raw query) or PrismaClientUnknownRequestError. Match on driverError.code or
    // a 23514 marker AND the constraint name — belt-and-suspenders. Must run BEFORE the
    // generic DB_ERROR fallback so the typed BALANCE_INSUFFICIENT reaches clients (deck
    // mutation $transaction in 03-11 + concurrent transfers).
    const driverErr = err.meta && err.meta.driverError;
    const errMsg = String(err.message || (driverErr && driverErr.message) || '');
    const has23514 = (driverErr && driverErr.code === '23514') || /\b23514\b/.test(errMsg);
    const hasBalanceCheck = /BankAccount_balance_nonneg_check/i.test(errMsg) ||
      /BankAccount_balance_nonneg_check/i.test(String(driverErr && driverErr.message) || '');
    if (has23514 && hasBalanceCheck) {
      status = 400;
      code = 'BALANCE_INSUFFICIENT';
      message = messages.BALANCE_INSUFFICIENT;
    } else {
      status = 500;
      code = 'DB_ERROR';
      message = messages.DB_ERROR;
    }
  } else if (err && (Array.isArray(err.errors) || typeof err.array === 'function')) {
    // express-validator failures (validationResult(req).throw())
    status = 400;
    code = 'VALIDATION_FAILED';
    message = messages.VALIDATION_FAILED;
  } else {
    status = 500;
    code = 'INTERNAL_ERROR';
    message = messages.INTERNAL_ERROR;
  }

  // Log everything including stack — but NEVER serialize stack into the response body.
  // Falls back to module-level logger when req.log is missing (e.g., when notFoundHandler skipped pino-http).
  const log = (req && req.log) || logger;
  log.error({ err, status, code, requestId: req && req.id }, 'request_error');

  const body = {
    error: code,
    message,
    requestId: req && req.id,
  };
  // D-10 (plan 03-05): VALIDATION_FAILED throw sites (Zod via reqValidator, manual
  // AppError instantiations) attach err.issues = [{path, code, message}]. Surface them
  // additively so mobile/admin can render top-level message in a banner AND highlight
  // individual fields. Strictly array-typed; never leak non-array shapes.
  if (err && Array.isArray(err.issues)) {
    body.issues = err.issues;
  }
  res.status(status).json(body);
}

module.exports = { errorNormalizer, notFoundHandler };
