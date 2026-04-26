const { createClient } = require('redis');
const { logger } = require('../logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

let redisAvailable = false;

redisClient.on('error', (err) => {
  // SEC-03 / B-C3 — transition-only logging. Once redisAvailable=false the
  // node-redis client retries on a backoff (multiple 'error' events per second
  // when the broker is down); we MUST NOT spam logs/Sentry on every retry.
  // The redisAvailable flag is the gate.
  if (redisAvailable) {
    logger.error(
      { err: { message: err.message, code: err.code } },
      '[redis] connection lost — cache will be bypassed'
    );
    redisAvailable = false;
    try {
      const { Sentry } = require('../instrument');
      if (Sentry?.addBreadcrumb) {
        Sentry.addBreadcrumb({
          category: 'redis',
          level: 'warning',
          message: 'connection lost',
          data: { errMessage: String(err.message), code: err.code },
        });
      }
    } catch (_e) {
      // instrument may not be loaded in unit-test env — non-fatal.
    }
  }
});
redisClient.on('connect', () => {
  logger.info('[redis] connected');
  redisAvailable = true;
});
redisClient.on('ready', () => {
  if (!redisAvailable) {
    logger.info({}, '[redis] connection restored');
    redisAvailable = true;
  }
});
redisClient.on('reconnecting', () => logger.info('[redis] reconnecting'));

redisClient.connect().catch(e => {
  logger.warn({ err: e }, '[redis] initial connection failed — cache disabled');
  // PATTERNS.md line 242: emit a Sentry breadcrumb so any later captureException carries
  // context that Redis was already down. Wrapped in try/catch because instrument.js may
  // not be loaded in test contexts that mock cache via jest.mock('../cache').
  try {
    const { Sentry } = require('../instrument');
    Sentry.addBreadcrumb({ category: 'redis', message: 'initial connection failed', level: 'warning' });
  } catch {
    // instrument.js may not be loaded in test contexts that mock cache; ignore.
  }
});

async function getCached(key) {
  // SEC-03 — short-circuit on the in-memory flag BEFORE consulting the client.
  // node-redis's isReady is true even mid-disconnect for a brief window, and
  // can yield throw paths that surface as 5xx if the route forgot to await.
  if (!redisAvailable) return null;
  try {
    if (!redisClient.isReady) return null;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.warn({ err: error, key }, 'Redis GET error');
    return null;
  }
}

async function setCached(key, value, ttlSeconds) {
  if (!redisAvailable) return;
  try {
    if (!redisClient.isReady) return;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.warn({ err: error, key }, 'Redis SET error');
  }
}

async function invalidatePattern(pattern) {
  if (!redisAvailable) return;
  try {
    if (!redisClient.isReady) return;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    logger.warn({ err: error, pattern }, 'Redis INVALIDATE error');
  }
}

module.exports = {
  redisClient,
  getCached,
  setCached,
  invalidatePattern
};
