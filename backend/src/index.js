require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { PrismaClient } = require('@prisma/client');

const { router: authRoutes, loginHandler } = require('./routes/auth');
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

const corsOptions = { origin: true, credentials: true };
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());

app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// Явная регистрация логина на корне app (надёжнее вложенного роутера в части сред / прокси)
app.post('/api/auth/login', loginHandler);
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

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

/**
 * HP drains on the server on this interval even when the mobile app is closed,
 * as long as this Node process is running (not tied to a client).
 * Override: ACTIVE_DECK_HP_TICK_MS in .env (default 60000 = 60s).
 */
const ACTIVE_DECK_HP_TICK_MS = Math.max(
  1000,
  parseInt(process.env.ACTIVE_DECK_HP_TICK_MS || '60000', 10) || 60000
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Active deck HP tick every ${ACTIVE_DECK_HP_TICK_MS}ms (env ACTIVE_DECK_HP_TICK_MS)`);

  setInterval(() => {
    tickActiveDeckCardHealth(prisma).catch((err) =>
      console.error('[active-deck-hp]', err)
    );
  }, ACTIVE_DECK_HP_TICK_MS);

  ensureAllUsersHaveActiveDeck(prisma)
    .then((n) => {
      if (n > 0) console.log(`[decks] у ${n} пользователей создана или активирована колода по умолчанию`);
    })
    .catch((err) => console.error('[decks] ensure:', err.message));
});

module.exports = app;
