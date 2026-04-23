require('dotenv').config(); // FIX: load .env before anything else

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');          // FIX: security headers
const rateLimit = require('express-rate-limit'); // FIX: rate limiting
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const cardRoutes = require('./routes/cards');
const notificationRoutes = require('./routes/notifications');
const subscriptionRoutes = require('./routes/subscriptions');
const adminRoutes = require('./routes/admin');

const app = express();
const prisma = new PrismaClient();

// Security headers
app.use(helmet());

// Rate limiting: 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});
app.use(limiter);

// CORS — explicit allowlist from env + dev patterns
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [];

// Allowed in development: Expo Go, localhost, LAN subnets
const DEV_PATTERNS = [
  /^exp:\/\/.*/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
];

app.use(cors({
  origin: (origin, callback) => {
    // No origin = same-origin request / native app / curl — allow
    if (!origin) return callback(null, true);

    // Explicit production allowlist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Pattern-based allowlist (dev only)
    if (
      process.env.NODE_ENV !== 'production' &&
      DEV_PATTERNS.some((p) => p.test(origin))
    ) {
      return callback(null, true);
    }

    console.warn('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Attach prisma to every request
app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
