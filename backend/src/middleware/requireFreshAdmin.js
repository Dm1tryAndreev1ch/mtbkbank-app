// backend/src/middleware/requireFreshAdmin.js
// Phase 3 / SEC-08 / D-05..D-08
//
// Re-checks DB-resident isAdmin flag on every /api/admin/* request after authMiddleware.
// 5-minute LRU cache (in-process — single-replica deploy at v1.0; D-05).
// On stale JWT (claim says admin, DB says no, OR status === BLOCKED) → 401 ADMIN_FLAG_REVOKED
// with structured pino warn + Sentry breadcrumb (D-06). invalidate(userId) drops the cache
// entry so admin demotes can take effect immediately (D-07).

const { LRUCache } = require('lru-cache');
const { logger } = require('../logger');
const { AppError } = require('../errors/AppError');

const CACHE_TTL_MS = 5 * 60 * 1000; // D-05 — 5 minutes
const CACHE_MAX = 1000;
const cache = new LRUCache({ max: CACHE_MAX, ttl: CACHE_TTL_MS });

async function requireFreshAdmin(req, _res, next) {
  try {
    const userId = req.userId; // populated by authMiddleware
    if (!userId) {
      // Defensive: requireFreshAdmin must NEVER mount before authMiddleware. If it does,
      // refuse cleanly rather than permitting unauth'd access via a cache-key-of-undefined.
      return next(new AppError('ADMIN_FLAG_REVOKED', 401));
    }

    let fresh = cache.get(userId);
    if (!fresh) {
      fresh = await req.prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true, status: true },
      });
      if (fresh) cache.set(userId, fresh);
    }

    if (!fresh || !fresh.isAdmin || fresh.status === 'BLOCKED') {
      logger.warn(
        {
          event: 'admin_flag_demoted',
          userId,
          requestId: req.id,
          jwtIssuedAt: req.jwtIat || null,
          dbIsAdmin: fresh ? fresh.isAdmin : null,
          dbStatus: fresh ? fresh.status : null,
        },
        'admin recheck failed; rejecting request'
      );
      try {
        const { Sentry } = require('../instrument');
        if (Sentry && typeof Sentry.addBreadcrumb === 'function') {
          Sentry.addBreadcrumb({
            category: 'auth',
            level: 'warning',
            message: 'admin_flag_demoted',
            data: { userId, requestId: req.id },
          });
        }
      } catch (_e) {
        // instrument may not be loaded in unit-test env — non-fatal
      }
      return next(new AppError('ADMIN_FLAG_REVOKED', 401));
    }

    next();
  } catch (err) {
    next(err);
  }
}

// D-07: invalidate the cache entry on demote (consumed by 03-10 admin user-update route).
requireFreshAdmin.invalidate = (userId) => cache.delete(userId);
// Exposed for test assertions only — DO NOT use in production code paths.
requireFreshAdmin._cache = cache;

module.exports = { requireFreshAdmin };
