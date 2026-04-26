// IMPORTANT: must be FIRST require — Sentry's @sentry/node@10 installs OpenTelemetry-style
// instrumentation via require() interception. ANY require above this line means Express
// (or whichever module loads first) misses its patches and HTTP transactions are absent.
// eslint-disable-next-line import/first
require('./instrument');
require('dotenv').config(); // populate process.env from .env BEFORE envalid runs

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const closeWithGrace = require('close-with-grace');
const pinoHttp = require('pino-http');
const pino = require('pino');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const { env } = require('./env');             // envalid fail-fast (plan 02)
const { logger } = require('./logger');       // pino factory (plan 01)
const { errorNormalizer, notFoundHandler } = require('./errors/errorNormalizer'); // plan 07
const healthRoutes = require('./routes/health'); // plan 08 — /healthz, /readyz, /version

const { router: authRoutes, loginHandler, registerHandler } = require('./routes/auth');
const { reqValidator } = require('./middleware/reqValidator');
const { loginSchema, registerSchema } = require('./schemas/auth');
const { loginLimiter, registerLimiter } = require('./middleware/authRateLimits');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const cardRoutes = require('./routes/cards');
const deckRoutes = require('./routes/decks');
const tradeRoutes = require('./routes/trades');
const questRoutes = require('./routes/quests');
const paymentRoutes = require('./routes/payments');
const limitRoutes = require('./routes/limits');
const notificationRoutes = require('./routes/notifications');
const subscriptionRoutes = require('./routes/subscriptions');
const adminRoutes = require('./routes/admin');
const { authMiddleware, adminMiddleware } = require('./middleware/auth');
const { requireFreshAdmin } = require('./middleware/requireFreshAdmin');
const { adminDestructiveLimiter } = require('./middleware/adminRateLimits');
const { tickActiveDeckCardHealth, acquireHpTickLeader } = require('./services/cardEngine');
const { ensureAllUsersHaveActiveDeck } = require('./services/ensureUserActiveDeck');

const app = express();
const prisma = new PrismaClient();

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// SEC-02 / B-C1 — wildcard refusal. A literal '*' in env.ALLOWED_ORIGINS would
// disable the allowlist entirely; refuse to boot rather than degrade silently.
if (ALLOWED_ORIGINS.includes('*')) {
  throw new Error("ALLOWED_ORIGINS must not contain '*' — set explicit origins for SEC-02");
}

// SEC-02 production guard: localhost/loopback origins are rejected in production
// regardless of whether they appear in the allowlist (e.g. operator forgets to
// strip dev origins from prod env).
const isLocalhostOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin);

function isOriginAllowed(origin) {
  if (!origin) return true; // no-Origin (mobile / curl / s2s) always allowed
  if (env.NODE_ENV === 'production' && isLocalhostOrigin(origin)) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    // Clean reject — passing an Error here would escalate through Express's
    // default error handler and emit a 500. `false` lets the cors package
    // simply omit the ACAO header; the reject middleware below converts
    // the cross-origin denial into a definitive 403 response.
    return callback(null, false);
  },
  credentials: true,
};

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
// SEC-02 — `cors` with callback(null, false) only omits the ACAO header on
// simple requests; the request would otherwise reach the route and return 200.
// This middleware turns disallowed Origins into a definitive 403 so the
// allowlist actually blocks instead of degrading to "no-CORS-header but body
// served".  Preflight (OPTIONS) is already short-circuited by `cors`.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'CORS_FORBIDDEN', message: 'Origin not allowed' });
  }
  return next();
});
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (existing && typeof existing === 'string') ? existing : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (req.url === '/healthz' || req.url === '/readyz' || req.url === '/version') return 'silent';
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
}));
app.use(express.json({ limit: '10kb' }));

app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// Per-request Sentry scope tag — every event captured during the request carries the same requestId
// so logs (X-Request-Id header) and Sentry events can be cross-referenced.
const { Sentry } = require('./instrument');
app.use((req, _res, next) => {
  Sentry.getCurrentScope().setTag('requestId', req.id);
  next();
});

// Phase 3 / Plan 03-07 / SEC-04 — Rate limiters now live in middleware/authRateLimits.js
// (Redis-backed). App-level `loginLimiter`/`registerLimiter`/`refreshLimiter` const
// definitions REMOVED here to close Pitfall 4 (double-counting from app+route mounts);
// regression-guard pins the absence of `^const (loginLimiter|registerLimiter|refreshLimiter)`
// at app level. The single source of truth is middleware/authRateLimits.js used by
// routes/auth.js. The two app-level POSTs below still need limiters because they bypass
// the router (D-14: explicit registration is more reliable than nested-router under some
// proxies); they reuse the SAME imported limiter instances, so the Redis bucket is
// shared and there is no double-count.
// Phase 3 / Plan 03-09 / SEC-10/SEC-12 — reqValidator(*) wired here too because
// these app-level POSTs bypass the router-level chain in routes/auth.js.
app.post('/api/auth/login', loginLimiter, reqValidator(loginSchema), loginHandler);
app.post('/api/auth/register', registerLimiter, reqValidator(registerSchema), registerHandler);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/limits', limitRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
// Phase 3 / SEC-08 / D-05..D-08 — admin chain: JWT → JWT-isAdmin claim fast-reject →
// DB recheck (5-min LRU). JWT-claim alone never authorizes admin actions; requireFreshAdmin
// is the source of truth and rejects stolen / un-revoked admin tokens within ≤5 min.
// Phase 3 / SEC-04 / D-13..D-15 — adminDestructiveLimiter caps mutation verbs at
// 60/min per actorId AFTER requireFreshAdmin has authoritatively confirmed the
// admin flag, so in-memory bucket keys are always JWT-verified userIds.
app.use('/api/admin', authMiddleware, adminMiddleware, requireFreshAdmin, adminDestructiveLimiter, adminRoutes);

/** Корень: чтобы в браузере было видно, что это наш API (а не чужой сервис на том же порту). */
app.get('/', (_req, res) => {
  res.json({
    service: 'MTBBank API',
    health: '/health',
    apiPrefix: '/api',
  });
});

// Health endpoints — mounted at ROOT (NOT /api/) per RESEARCH §5.6 + PATTERNS divergence.
// Replaces the temporary /health alias from plan 03; deployments must migrate to /healthz.
app.use(healthRoutes);

// Dev-only Sentry verification endpoint (D-03). NOT mounted in production.
// Throws an AppError so the chain runs through Sentry.setupExpressErrorHandler →
// errorNormalizer and produces a JSON {error,message,requestId} response while Sentry
// captures the exception with the per-request requestId tag set above.
if (env.NODE_ENV !== 'production') {
  app.get('/__test__/sentry-error', (_req, _res, next) => {
    const { AppError } = require('./errors/AppError');
    next(new AppError('INTERNAL_ERROR', 500, 'Phase-1 test error'));
  });
}

// 404 handler — 3-arg, returns directly (Risk 8.6 mitigation), never calls next.
// MUST come before Sentry.setupExpressErrorHandler so unmounted paths return the
// Russian NOT_FOUND contract instead of falling through to the generic 500 path.
app.use(notFoundHandler);
// Sentry Express error handler — captures any error that bubbles past the routes; mounted
// AFTER all routes/404 handler (per RESEARCH §5.6) and BEFORE the generic errorNormalizer
// so Sentry sees the raw error shape before downstream sanitisation. `Sentry` is in scope
// from the per-request middleware block above (do NOT re-require here).
Sentry.setupExpressErrorHandler(app);
// Final translator: thrown errors → JSON {error, message, requestId} (4-branch classifier).
// Stack trace stays in pino logs; never serialized into the HTTP response body.
app.use(errorNormalizer);

/**
 * Boot the listener + cron + close-with-grace ONLY when this file is executed
 * directly (`node src/index.js`, `npm start`, child-spawn from
 * graceful-shutdown.test.js). When supertest does `require('../src/index')`
 * for HTTP integration tests, we skip listener/cron/shutdown registration so
 * the test can drive the app through supertest's ephemeral port without the
 * real listener fighting for env.PORT.
 */
function bootRuntime() {
  const httpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server_started');
    logger.info(
      { tickMs: env.ACTIVE_DECK_HP_TICK_MS },
      `Active deck HP tick every ${env.ACTIVE_DECK_HP_TICK_MS}ms (env ACTIVE_DECK_HP_TICK_MS)`
    );

    ensureAllUsersHaveActiveDeck(prisma)
      .then((n) => {
        if (n > 0) {
          logger.info(
            { userCount: n },
            `[decks] у ${n} пользователей создана или активирована колода по умолчанию`
          );
        }
      })
      .catch((err) => logger.error({ err }, '[decks] ensure failed'));
  });

  /**
   * HP drains on the server on this interval even when the mobile app is closed,
   * as long as this Node process is running (not tied to a client).
   * Override: ACTIVE_DECK_HP_TICK_MS in .env (default 60000 = 60s, min 1000).
   *
   * Errors route through hpTickReporter so Sentry captures are rate-limited (5 per
   * 5min via Redis incr counter + ['hp-tick-error'] fingerprint) — a Redis flicker
   * that fires 1440 ticks/day cannot exhaust the free-tier quota. logger.error always
   * fires inside reportHpTickError regardless of capture decision (pino redact applies).
   */
  // REL-10 — leader-election: every tick first attempts redis SET NX PX on
  // 'lock:hp-tick' with TTL = tickMs * 2. Only the acquirer runs the tick body.
  // Lossy renewal is intentional — if the leader dies, the next tick re-elects.
  // Single-replica v1.0 + Redis-unavailable fail-open is preserved (acquireHpTickLeader
  // returns true on no/unready Redis, so the only running process keeps ticking).
  const hpTickHandle = setInterval(async () => {
    try {
      const isLeader = await acquireHpTickLeader(env.ACTIVE_DECK_HP_TICK_MS);
      if (!isLeader) {
        logger.debug({ event: 'hp-tick-skipped', reason: 'not_leader' });
        return;
      }
      await tickActiveDeckCardHealth(prisma);
    } catch (err) {
      require('./services/hpTickReporter').reportHpTickError(err, {
        tickIntervalMs: env.ACTIVE_DECK_HP_TICK_MS,
      });
    }
  }, env.ACTIVE_DECK_HP_TICK_MS);

  closeWithGrace({ delay: 10000 }, async ({ err, signal }) => {
    if (err) logger.error({ err }, 'shutdown_with_error');
    else logger.info({ signal }, 'shutdown_start');

    await new Promise((resolve) => httpServer.close(resolve));
    clearInterval(hpTickHandle);

    try {
      await prisma.$disconnect();
    } catch (e) {
      logger.warn({ err: e }, 'prisma_disconnect_failed');
    }

    try {
      const { redisClient } = require('./cache');
      if (redisClient && redisClient.isReady) await redisClient.quit();
    } catch (e) {
      logger.warn({ err: e }, 'redis_quit_failed');
    }

    logger.info('shutdown_complete');
  });
}

if (require.main === module) {
  bootRuntime();
}

// Phase 4 / 04-02 / B-M8 — expose the live PrismaClient instance the app uses
// so integration tests can spy on its model accessors (e.g. notification.create).
// Production code paths still go through req.prisma; this is just an additional
// handle for tests that need to fault-inject without standing up a parallel app.
module.exports = app;
module.exports.prisma = prisma;
