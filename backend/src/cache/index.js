const { createClient } = require('redis');
const { logger } = require('../logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

let redisAvailable = false;

redisClient.on('error', (err) => {
  if (redisAvailable) {
    logger.error({ err }, '[redis] connection lost — cache will be bypassed');
    redisAvailable = false;
  }
});
redisClient.on('connect', () => {
  logger.info('[redis] connected');
  redisAvailable = true;
});
redisClient.on('reconnecting', () => logger.info('[redis] reconnecting'));

redisClient.connect().catch(e => {
  logger.warn({ err: e }, '[redis] initial connection failed — cache disabled');
});

async function getCached(key) {
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
  try {
    if (!redisClient.isReady) return;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.warn({ err: error, key }, 'Redis SET error');
  }
}

async function invalidatePattern(pattern) {
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
