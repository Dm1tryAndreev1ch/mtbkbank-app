// MUST be first — Sentry's @sentry/node@10 instruments via require()-interception.
// instrument.js is created by plan 04. Until then, the try/catch no-ops cleanly.
// PLAN 04 will swap this defensive try/catch for a hard `require('./instrument');` statement.
// eslint-disable-next-line import/first
try { require('./instrument'); } catch (e) {
  if (!/Cannot find module/.test(e.message)) throw e;
}
require('dotenv').config(); // populate process.env from .env BEFORE envalid runs

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const closeWithGrace = require('close-with-grace');
const pinoHttp = require('pino-http');
const pino = require('pino');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const { env } = require('./env');             // envalid fail-fast (plan 02)
const { logger } = require('./logger');       // pino factory (plan 01)

const { router: authRoutes, loginHandler, registerHandler } = require('./routes/auth');
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
const { tickActiveDeckCardHealth } = require('./services/cardEngine');
const { ensureAllUsersHaveActiveDeck } = require('./services/ensureUserActiveDeck');

const app = express();
const prisma = new PrismaClient();

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
};

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
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

// PLAN 04: Sentry per-request scope tag goes here. Until then, no-op.
// app.use((req, _res, next) => { Sentry.getCurrentScope().setTag('requestId', req.id); next(); });

// Rate limiting for auth endpoints — generous enough to never hit during normal use
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // 5 registrations per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много регистраций. Попробуйте позже.' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 refreshes per window (mobile auto-refreshes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
});

// Явная регистрация логина на корне app (надёжнее вложенного роутера в части сред / прокси)
app.post('/api/auth/login', loginLimiter, loginHandler);
app.post('/api/auth/register', registerLimiter, registerHandler);
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
app.use('/api/admin', adminRoutes);

/** Корень: чтобы в браузере было видно, что это наш API (а не чужой сервис на том же порту). */
app.get('/', (_req, res) => {
  res.json({
    service: 'MTBBank API',
    health: '/health',
    apiPrefix: '/api',
  });
});

// PLAN 08: app.use(healthRoutes);  // mounts /healthz, /readyz, /version (and removes the /health alias below)
// PLAN 08: dev-only /__test__/sentry-error endpoint (NODE_ENV !== 'production')
// For now: keep the existing /health alias so deployments don't break.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// PLAN 07: app.use(notFoundHandler);
// PLAN 04: Sentry.setupExpressErrorHandler(app);
// PLAN 07: app.use(errorNormalizer);

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
   * PLAN 04 will replace the .catch with hpTickReporter.reportHpTickError so Sentry
   * is notified when a tick fails (currently we just log).
   */
  const hpTickHandle = setInterval(() => {
    tickActiveDeckCardHealth(prisma).catch((err) =>
      logger.error({ err, event: 'hp-tick-error' }, '[active-deck-hp] tick failed')
    );
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

module.exports = app;
