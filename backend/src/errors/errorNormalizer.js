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
    err instanceof Prisma.PrismaClientValidationError
  ) {
    status = 500;
    code = 'DB_ERROR';
    message = messages.DB_ERROR;
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

  res.status(status).json({
    error: code,
    message,
    requestId: req && req.id,
  });
}

module.exports = { errorNormalizer, notFoundHandler };
