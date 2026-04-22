require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const paymentRoutes = require('./routes/payments');
const cardRoutes = require('./routes/cards');
const deckRoutes = require('./routes/decks');
const tradeRoutes = require('./routes/trades');
const questRoutes = require('./routes/quests');
const subscriptionRoutes = require('./routes/subscriptions');
const limitRoutes = require('./routes/limits');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const { decayAllCardHealth, cleanupDeadCards } = require('./services/cardEngine');
const { setupWebSockets } = require('./websocket');

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
// Apply global limiter conceptually to API
app.use('/api', globalLimiter);

// Make prisma available to routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/limits', limitRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup WebSockets
setupWebSockets(server);

// Cron: Health decay every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily card health decay...');
  try {
    await decayAllCardHealth(prisma);
    await cleanupDeadCards(prisma);
    console.log('[CRON] Health decay complete.');
  } catch (err) {
    console.error('[CRON] Health decay error:', err);
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏦 MTBBank API running on port ${PORT}`);
});

module.exports = { app, server };
