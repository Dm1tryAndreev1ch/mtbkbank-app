const jwt = require('jsonwebtoken');
const { env } = require('../env');

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET); // throws TokenExpiredError / JsonWebTokenError
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin || false;
    req.jwtIat = decoded.iat || null; // for requireFreshAdmin's structured warn (03-03)
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, verifyAccessToken };
