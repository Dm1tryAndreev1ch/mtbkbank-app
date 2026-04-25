/**
 * Phase 1 shared test setup.
 * Loaded BEFORE every test via jest.config.js setupFiles.
 * Sets baseline env vars so envalid (plan 02) does not exit during test boot.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';
