const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

let redisAvailable = false;

redisClient.on('error', (err) => {
  if (redisAvailable) {
    console.error('[redis] connection lost — cache will be bypassed:', err.message);
    redisAvailable = false;
  }
});
redisClient.on('connect', () => {
  console.log('[redis] connected');
  redisAvailable = true;
});
redisClient.on('reconnecting', () => console.log('[redis] reconnecting…'));

redisClient.connect().catch(e => {
  console.warn('[redis] initial connection failed — cache disabled:', e.message);
});

async function getCached(key) {
  try {
    if (!redisClient.isReady) return null;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn(`Redis GET error for key ${key}:`, error.message);
    return null;
  }
}

async function setCached(key, value, ttlSeconds) {
  try {
    if (!redisClient.isReady) return;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.warn(`Redis SET error for key ${key}:`, error.message);
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
    console.warn(`Redis INVALIDATE error for pattern ${pattern}:`, error.message);
  }
}

module.exports = {
  redisClient,
  getCached,
  setCached,
  invalidatePattern
};
