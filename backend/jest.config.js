/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Phase 1: no coverage threshold yet; Phase 9 CI will set it.
  testTimeout: 15000,
};
