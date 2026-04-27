const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter, registerLimiter, refreshLimiter } = require('../middleware/authRateLimits');
const { logger } = require('../logger');
const { env } = require('../env');
const { AppError } = require('../errors/AppError');
const { reqValidator } = require('../middleware/reqValidator');
const { loginSchema, registerSchema, refreshSchema } = require('../schemas/auth');
const router = express.Router();

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
// Phase 4 / 04-02 / B-M2 — DB-side expiry stamp matches JWT lifetime (30d).
// Stored on User.refreshTokenExpiresAt so /refresh can reject expired tokens
// even if the JWT signature still verifies (e.g. a paranoid future where we
// shorten REFRESH_TTL but historical tokens remain in the wild).
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Phase 3 / SEC-12 / D-12 — precomputed dummy hash for constant-cost compare on
// the user-not-found path. bcrypt.compare(pin, DUMMY_HASH) costs the same as a
// real compare on the same rounds, so wall-clock timing cannot leak whether
// `phone` is a registered account. Never used as an authentication target.
const DUMMY_HASH = bcrypt.hashSync('dummy-pin-for-timing-parity', 10);

function normalizePhone(phone) {
  let p = String(phone ?? '').trim().replace(/[\s()-]/g, '');
  if (!p) return null;
  if (p.startsWith('8') && p.length === 11) p = `+7${p.slice(1)}`;
  else if (p.startsWith('7') && p.length === 11) p = `+${p}`;
  else if (!p.startsWith('+')) p = `+${p}`;
  return p;
}

function digitsOnlyPan(cardNumber) {
  return String(cardNumber ?? '').replace(/\D/g, '');
}

function signAccess(userId, isAdmin) {
  return jwt.sign(
    { userId, isAdmin: !!isAdmin },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(userId) {
  return jwt.sign(
    { userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

/** POST /api/auth/login — timing-safe per SEC-12/D-12. */
async function loginHandler(req, res, next) {
  try {
    // reqValidator(loginSchema) populated req.validated with shape { phone, pin }.
    const { phone, pin } = req.validated;
    const user = await req.prisma.user.findUnique({ where: { phone } });

    // CRITICAL (D-12): always run bcrypt.compare regardless of user existence.
    // The dummy-hash branch costs the same as a real bcrypt.compare on the same
    // rounds → wall-clock timing cannot leak whether `phone` is a registered
    // account. Branching on the boolean happens AFTER the compare resolves.
    const ok = await bcrypt.compare(pin, user?.pin || DUMMY_HASH);

    if (!user || !ok || user.status === 'BLOCKED' || user.deletedAt) {
      // Single error code + Russian message regardless of branch.
      // BLOCKED and soft-deleted (deletedAt != null) users collapse into
      // AUTH_INVALID_CREDENTIALS — distinguishing them would leak phone-existence
      // and "this phone was deleted" oracles. Closes the 04.5-05 soft-delete UI
      // promise ("Вход будет запрещён") per the threat model T-03-09-02.
      throw new AppError('AUTH_INVALID_CREDENTIALS', 401);
    }

    const accessToken = signAccess(user.id, user.isAdmin);
    const refreshToken = signRefresh(user.id);

    await req.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        // Phase 4 / 04-02 / B-M2 — DB-side expiry stamp at issuance.
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id, name: user.name, phone: user.phone,
        mbPoints: user.mbPoints, status: user.status, isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/register — Zod-validated input via reqValidator(registerSchema). */
async function registerHandler(req, res, next) {
  try {
    // Zod has already validated phone (^\+\d{11,15}$), pin (^\d{4}$), Luhn-checked
    // cardNumber (13–19 digits), and name lengths. Re-normalize phone defensively
    // in case future intake widens the regex (idempotent for already-normalized input).
    const { firstName, lastName, cardNumber, phone, pin } = req.validated;
    const fn = String(firstName).trim();
    const ln = String(lastName).trim();
    const normalizedPhone = normalizePhone(phone);
    const pan = digitsOnlyPan(cardNumber);

    const existing = await req.prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existing) return res.status(409).json({ error: 'Пользователь с таким телефоном уже зарегистрирован' });

    const name = `${fn} ${ln}`;
    const hashedPin = await bcrypt.hash(String(pin), 10);
    const last4 = pan.slice(-4);
    const maskedNumber = `**** **** **** ${last4}`;
    const cardBrand = pan[0] === '4' ? 'VISA' : 'Mastercard';

    const user = await req.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name,
          phone: normalizedPhone,
          pin: hashedPin,
          status: 'STANDARD',
          isAdmin: false,
          mbPoints: 0,
        },
      });
      const account = await tx.bankAccount.create({
        data: {
          userId: u.id,
          name: 'Главный счёт',
          type: 'main',
          balance: 0,
          currency: 'RUB',
        },
      });
      await tx.bankCard.create({
        data: {
          userId: u.id,
          accountId: account.id,
          maskedNumber,
          type: cardBrand,
          tier: 'Standard',
        },
      });
      await tx.deck.create({
        data: { userId: u.id, name: 'Моя колода', isActive: true },
      });
      return u;
    });

    const accessToken = signAccess(user.id, false);
    const refreshToken = signRefresh(user.id);

    await req.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        // Phase 4 / 04-02 / B-M2 — DB-side expiry stamp at issuance.
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        mbPoints: user.mbPoints,
        status: user.status,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Register error');
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: 'Такой телефон уже занят' });
    }
    return next(err);
  }
}

router.options('/login', (_req, res) => res.sendStatus(204));
router.get('/login', (_req, res) => {
  res.status(405).json({ error: 'Используйте POST с JSON: { "phone", "pin" }' });
});
// Phase 3 / Plan 03-07 / SEC-04 — limiters live in middleware/authRateLimits.js
// (Redis-backed via shared redisClient). Old in-memory definitions removed.
// Phase 3 / Plan 03-09 / SEC-10/SEC-12 — reqValidator(*) wired before each handler.
router.post('/login', loginLimiter, reqValidator(loginSchema), loginHandler);
router.post('/register', registerLimiter, reqValidator(registerSchema), registerHandler);

// POST /api/auth/refresh — rate limited at router level (per-user key) +
// Zod-validated input. The handler still uses legacy res.status(...).json(...)
// shape on jwt-verify/DB-mismatch failures — those are NOT covered by 03-09
// (separate token-rotation contract owned by Phase 2 D-13).
router.post('/refresh', refreshLimiter, reqValidator(refreshSchema), async (req, res) => {
  try {
    const { refreshToken } = req.validated;

    let payload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    const user = await req.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, status: true, isAdmin: true, refreshToken: true, refreshTokenExpiresAt: true },
    });
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }
    // Phase 4 / 04-02 / B-M2 — DB-side expiry gate. The JWT signature may still
    // verify (REFRESH_TTL is 30d so the JWT exp matches) but if a future tightening
    // backdates expiresAt or a manual revocation drops it to the past, we reject
    // here with a stable error code REFRESH_TOKEN_EXPIRED so the client can route
    // straight to /login instead of looping silent-refresh.
    if (
      user.refreshTokenExpiresAt &&
      user.refreshTokenExpiresAt.getTime() < Date.now()
    ) {
      (req.log ?? logger).warn({ userId: user.id }, 'Refresh token expired');
      return res.status(401).json({
        error: 'REFRESH_TOKEN_EXPIRED',
        message: 'Сессия истекла, войдите снова',
      });
    }
    if (user.status === 'BLOCKED') return res.status(403).json({ error: 'Аккаунт заблокирован' });

    const newAccessToken = signAccess(user.id, user.isAdmin);
    const newRefreshToken = signRefresh(user.id);

    await req.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: newRefreshToken,
        // Phase 4 / 04-02 / B-M2 — refresh expiry sliding window resets at rotation.
        refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Refresh error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await req.prisma.user.update({
      where: { id: req.userId },
      data: { refreshToken: null },
    });
    res.json({ success: true });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'Logout error');
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = { router, loginHandler, registerHandler };
