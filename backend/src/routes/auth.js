const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';

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

/** Алгоритм Луна для банковского номера карты. */
function luhnValid(pan) {
  if (!pan || pan.length < 13 || pan.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let n = parseInt(pan[i], 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function signAccess(userId, isAdmin) {
  return jwt.sign(
    { userId, isAdmin: !!isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

/** POST /api/auth/login — вынесен в именованный handler для явного app.post в index.js */
async function loginHandler(req, res) {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: 'Укажите телефон и PIN' });

    const user = await req.prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(401).json({ error: 'Неверный телефон или PIN' });
    if (user.status === 'BLOCKED') return res.status(403).json({ error: 'Аккаунт заблокирован' });

    const ok = await bcrypt.compare(pin, user.pin);
    if (!ok) return res.status(401).json({ error: 'Неверный телефон или PIN' });

    const accessToken = signAccess(user.id, user.isAdmin);
    const refreshToken = signRefresh(user.id);

    await req.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
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
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

/** POST /api/auth/register — самостоятельная регистрация (клиентское приложение). */
async function registerHandler(req, res) {
  try {
    const { firstName, lastName, cardNumber, phone, pin } = req.body;
    const fn = String(firstName ?? '').trim();
    const ln = String(lastName ?? '').trim();
    if (!fn || !ln) return res.status(400).json({ error: 'Укажите имя и фамилию' });
    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'ПИН-код должен состоять из 4 цифр' });
    }

    const normalizedPhone = normalizePhone(phone);
    const phoneDigits = normalizedPhone ? normalizedPhone.replace(/\D/g, '') : '';
    if (!normalizedPhone || phoneDigits.length < 11 || phoneDigits.length > 15) {
      return res.status(400).json({
        error: 'Укажите корректный номер телефона с кодом страны (например +79001234567)',
      });
    }

    const pan = digitsOnlyPan(cardNumber);
    if (!luhnValid(pan)) {
      return res.status(400).json({
        error: 'Некорректный номер карты. Введите 13–19 цифр с действительной контрольной суммой.',
      });
    }

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
      data: { refreshToken },
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
    console.error('Register error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Такой телефон уже занят' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

router.options('/login', (_req, res) => res.sendStatus(204));
router.get('/login', (_req, res) => {
  res.status(405).json({ error: 'Используйте POST с JSON: { "phone", "pin" }' });
});
router.post('/login', loginHandler);
/** Дублирует app.post('/api/auth/register') — если клиент/прокси бьёт только в смонтированный роутер. */
router.post('/register', registerHandler);

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    const user = await req.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, status: true, isAdmin: true, refreshToken: true },
    });
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }
    if (user.status === 'BLOCKED') return res.status(403).json({ error: 'Аккаунт заблокирован' });

    const newAccessToken = signAccess(user.id, user.isAdmin);
    const newRefreshToken = signRefresh(user.id);

    await req.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = { router, loginHandler, registerHandler };
