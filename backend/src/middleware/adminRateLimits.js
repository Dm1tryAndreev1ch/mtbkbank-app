// backend/src/middleware/adminRateLimits.js
// Phase 3 / SEC-04 / D-13 / D-14 / D-15 — admin destructive in-memory limiter.
//
// Defense-in-depth atop authMiddleware → adminMiddleware → requireFreshAdmin:
//   - Caps abusive bulk mutations from a compromised admin token at 60/min per actorId.
//   - In-memory store: admin actions are rare and restart-resets are acceptable (D-14).
//   - Read methods (GET / HEAD) skipped — D-13 limits only mutation verbs.
//   - Keyed on req.userId (set by JWT-verified authMiddleware), not header-derived,
//     so X-Forwarded-For spoofing cannot fan out the bucket (D-15). req.ip fallback
//     is purely defensive — should never trigger because requireFreshAdmin would have
//     401'd a request that lacks req.userId.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const adminDestructiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // D-15: per-actorId. ipKeyGenerator collapses IPv6 prefixes safely so a future
  // un-authed path (defensive fallback) cannot trigger ERR_ERL_KEY_GEN_IPV6.
  keyGenerator: (req, res) => req.userId || ipKeyGenerator(req, res),
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  handler: (req, res) => {
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Слишком много операций. Попробуйте позже.',
      requestId: req.id,
    });
  },
});

module.exports = { adminDestructiveLimiter };
