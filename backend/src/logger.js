/**
 * Singleton pino logger with PII redact paths + dev pino-pretty transport.
 *
 * Per OBS-01 (CLAUDE.md): every backend log line is JSON with PII fields
 * (`pin`, `password`, `cardNumber`, `Authorization`, `refreshToken`) replaced
 * by `[REDACTED]` at every nesting depth.
 *
 * pino-http (which mints `req.id` and binds `req.log` per-request) is wired
 * separately in plan 03 as part of the Express middleware reorder.
 */
const pino = require('pino');

const FORBIDDEN_PATHS = [
  // Top-level common shapes
  'pin',
  'password',
  'cardNumber',
  'refreshToken',
  'authorization',
  // Express request/response shapes
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.pin',
  'req.body.password',
  'req.body.cardNumber',
  'req.body.refreshToken',
  'req.body.token',
  'res.headers["set-cookie"]',
  // Wildcard catches for nested PII
  '*.pin',
  '*.password',
  '*.cardNumber',
  '*.refreshToken',
  '*.token',
  '*.authorization',
];

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const logger = pino({
  level,
  redact: {
    paths: FORBIDDEN_PATHS,
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: false },
        },
      }),
});

module.exports = { logger, FORBIDDEN_PATHS };
