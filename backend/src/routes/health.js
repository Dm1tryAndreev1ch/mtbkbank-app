/**
 * Health endpoints.
 * - GET /healthz : liveness — synchronous 200, no DB/Redis touch (must answer even when deps are down)
 * - GET /readyz  : readiness — DB ping + Redis isReady check; 503 when either is down; 5s in-memory cache
 * - GET /version : build metadata — version + git SHA + build/start time + nodeEnv
 *
 * Mounted at ROOT level by backend/src/index.js (NOT /api/) per RESEARCH §5.6 + PATTERNS divergence.
 */
const express = require('express');
const router = express.Router();
const { env } = require('../env');
const { logger } = require('../logger');
const { redisClient } = require('../cache');

let readyzCache = { ts: 0, ok: false, body: null };
const READYZ_CACHE_MS = 5000;

router.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/readyz', async (req, res) => {
  if (Date.now() - readyzCache.ts < READYZ_CACHE_MS && readyzCache.body) {
    return res.status(readyzCache.ok ? 200 : 503).json(readyzCache.body);
  }
  try {
    if (!req.prisma) throw new Error('prisma_missing');
    await req.prisma.$queryRaw`SELECT 1`;
    const redisOk = redisClient && redisClient.isReady;
    if (!redisOk) throw new Error('redis_not_ready');
    readyzCache = { ts: Date.now(), ok: true, body: { status: 'ready', db: 'ok', redis: 'ok' } };
    return res.status(200).json(readyzCache.body);
  } catch (err) {
    const log = (req && req.log) || logger;
    log.error({ err }, 'readyz_failed');
    readyzCache = { ts: Date.now(), ok: false, body: { status: 'unready', error: err.message } };
    return res.status(503).json(readyzCache.body);
  }
});

router.get('/version', (_req, res) => {
  res.status(200).json({
    version: env.npm_package_version,
    sha: env.BUILD_SHA,
    builtAt: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    nodeEnv: env.NODE_ENV,
  });
});

// Test-only cache reset — used by health-endpoints.test.js to exercise both branches deterministically.
function __resetReadyzCacheForTests() {
  readyzCache = { ts: 0, ok: false, body: null };
}

module.exports = router;
module.exports.__resetReadyzCacheForTests = __resetReadyzCacheForTests;
