/**
 * HP-tick error reporter — Redis-backed fingerprint rate-limit for the HP-decay cron.
 * Caps Sentry captures at 5 events per 5-minute window so a Redis flicker (1440 ticks/day)
 * cannot exhaust the free-tier 5K-events/month quota. When Redis itself is the failing
 * dependency, falls back to a process-local guard that captures the FIRST error and
 * suppresses the rest for 5 minutes.
 *
 * Per D-04 + RESEARCH §5.3.
 */
const { Sentry } = require('../instrument');
const { logger } = require('../logger');

const RATE_LIMIT_KEY = 'sentry:hp-tick-rate';
const WINDOW_SECONDS = 300; // 5 minutes
const WINDOW_MAX = 5;
const FALLBACK_TTL_MS = 300_000;

let __processFallbackReportedAt = 0;

async function reportHpTickError(err, context = {}) {
  // Layer 1: log always (pino redact applies)
  logger.error({ err, ...context }, 'hp_tick_error');

  // Layer 2: rate-limit decision
  let shouldCapture = true;
  try {
    const { redisClient } = require('../cache');
    if (redisClient && redisClient.isReady) {
      const count = await redisClient.incr(RATE_LIMIT_KEY);
      if (count === 1) await redisClient.expire(RATE_LIMIT_KEY, WINDOW_SECONDS);
      shouldCapture = count <= WINDOW_MAX;
    } else {
      throw new Error('redis_not_ready');
    }
  } catch {
    // Redis is the failing dep — fall back to process-local guard
    const now = Date.now();
    if (now - __processFallbackReportedAt > FALLBACK_TTL_MS) {
      __processFallbackReportedAt = now;
      shouldCapture = true;
    } else {
      shouldCapture = false;
    }
  }

  if (shouldCapture) {
    Sentry.withScope((scope) => {
      scope.setFingerprint(['hp-tick-error']);
      scope.setTag('component', 'cron-hp-tick');
      scope.setContext('hp_tick', context);
      Sentry.captureException(err);
    });
  }
}

// Test-only reset to keep unit tests deterministic
function __resetForTests() {
  __processFallbackReportedAt = 0;
}

module.exports = { reportHpTickError, __resetForTests };
