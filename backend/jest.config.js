/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // __mocks__ subdir is for manual mocks of node_modules; not a test file dir.
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Phase 2 Wave 0 — runs `prisma migrate deploy` once per test invocation
  // against the docker-compose.test.yml DB before any worker spins up.
  globalSetup: '<rootDir>/tests/global-setup.js',
  // Map ESM-only deps that supertest/integration tests load via the real app
  // graph. Plan 01-03 wires expo-server-sdk; later plans may add more.
  moduleNameMapper: {
    '^expo-server-sdk$': '<rootDir>/tests/__mocks__/expo-server-sdk.js',
  },
  // Phase 1: no coverage threshold yet; Phase 9 CI will set it.
  testTimeout: 15000,
  // The Redis client (cache/index.js) keeps an open socket handle alive across
  // tests; supertest-loaded integration tests pull cache via the route graph.
  // forceExit lets Jest terminate cleanly after all tests pass. Pre-existing
  // behaviour noted in plan 01-01 SUMMARY (cache initial-connection retry loop).
  forceExit: true,
};
