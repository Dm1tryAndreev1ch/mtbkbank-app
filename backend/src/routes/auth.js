const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';

// FIX: isAdmin included in access token so adminMiddleware works correctly
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

// CORS preflight / случайный GET из браузера — без этого часто виден «404» на /api/auth/login
router.options('/login', (_req, res) => res.sendStatus(204));
router.get('/login', (_req, res) => {
  res.status(405).json({ error: 'Используйте POST с JSON: { "phone", "pin" }' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
});

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

module.exports = router;
