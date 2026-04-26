// Phase 3 / Plan 03-07 / SEC-04 / B-M1 — Redis-backed rate limits for /auth/*.
//
// Counters MUST survive backend restart (success-criterion 4: "fill bucket → restart
// container → next attempt still 429"). The previous in-memory MemoryStore from
// express-rate-limit reset on every deploy, which broke the SEC-04 contract.
//
// Pitfall 4 (Phase-3 PATTERNS): mounting the same limiter at BOTH app-level
// (backend/src/index.js) AND route-level (backend/src/routes/auth.js) double-counts
// every request. This module is the single source of truth — auth.js mounts these
// directly and index.js MUST NOT re-define them. regression-guard pins the absence
// of `^const (loginLimiter|registerLimiter|refreshLimiter)` at app level.
//
// Caps per D-13 (lowered from Phase-1's 10/30 to abuse-resistant values):
//   - login    : 5 / 15min, keyed on req.ip
//   - register : 3 / 1h    , keyed on req.ip
//   - refresh  : 60 / 1min , keyed on userId from decoded refresh token (IP fallback)
//
// Threat T-03-07-04: jwt.decode (NOT verify) inside refreshLimiter keyGenerator is
// SAFE because the decoded value derives ONLY a cache key. Real auth still happens
// in the route handler via jwt.verify against env.JWT_REFRESH_SECRET.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const jwt = require('jsonwebtoken');
const { redisClient } = require('../cache');

function makeStore(prefix) {
  return new RedisStore({
    // node-redis v5 exposes sendCommand(args[]) returning a Promise — matches
    // rate-limit-redis@4 contract directly. Do NOT spread args; the library
    // already passes a flat string[] (e.g. ['INCR', 'rl:login:1.2.3.4']).
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
}

// Single error contract for all auth limiters — matches D-05/D-06 codebook so
// clients render Russian message verbatim and the error code is stable for tests.
const handler = (req, res) => {
  res.status(429).json({
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Слишком много попыток. Попробуйте позже.',
    requestId: req.id,
  });
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('login'),
  // express-rate-limit@8 ERR_ERL_KEY_GEN_IPV6: bare req.ip for IPv6 lets a single
  // attacker's /64 prefix bypass the limit by rotating the host suffix. The
  // ipKeyGenerator helper normalises IPv6 to its /64 prefix.
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('register'),
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler,
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('refresh'),
  keyGenerator: (req) => {
    const token = req.body?.refreshToken;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.userId) return `u:${decoded.userId}`;
      } catch (_e) {
        // decode failure is not fatal — fall through to IP-based key. The
        // route handler's jwt.verify is the actual auth gate; this is just
        // a cache-key derivation for per-user counter scoping.
      }
    }
    return ipKeyGenerator(req.ip);
  },
  handler,
});

module.exports = { loginLimiter, registerLimiter, refreshLimiter };
