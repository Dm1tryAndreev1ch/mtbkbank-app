/**
 * Phase 3 — Plan 03-12 — SEC-11 live tests.
 *
 * WS handshake JWT verification, shared with HTTP auth (env.JWT_SECRET).
 */

const { io: ioc } = require('socket.io-client');
const http = require('node:http');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;
let httpServer;
let port;

beforeAll((done) => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
  httpServer = http.createServer(app);
  const { setupWebSockets } = require('../../src/websocket');
  setupWebSockets(httpServer);
  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll(async () => {
  await new Promise((r) => httpServer.close(r));
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

describe('WS handshake JWT (SEC-11)', () => {
  it('connect with no auth.token -> handshake error AUTH_TOKEN_INVALID', async () => {
    const client = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    const err = await new Promise((r) => client.on('connect_error', r));
    expect(err.message).toBe('AUTH_TOKEN_INVALID');
    client.disconnect();
  });

  it('connect with malformed JWT -> handshake error AUTH_TOKEN_INVALID + log ws_handshake_invalid_token', async () => {
    const { logger } = require('../../src/logger');
    const warnSpy = jest.spyOn(logger, 'warn');

    const client = ioc(`http://localhost:${port}`, {
      auth: { token: 'not.a.jwt' },
      transports: ['websocket'],
      reconnection: false,
    });
    const err = await new Promise((r) => client.on('connect_error', r));
    expect(err.message).toBe('AUTH_TOKEN_INVALID');

    const events = warnSpy.mock.calls.filter(
      (c) => c[0] && c[0].event === 'ws_handshake_invalid_token'
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0][0].reason).toBeTruthy();

    warnSpy.mockRestore();
    client.disconnect();
  });

  it('verifier shared with HTTP auth (uses env.JWT_SECRET, not process.env.JWT_SECRET)', () => {
    const fs = require('node:fs');
    const wsSrc = fs.readFileSync('src/websocket/index.js', 'utf8');
    expect(wsSrc).not.toMatch(/process\.env\.JWT_SECRET/);
    expect(wsSrc).toMatch(/verifyAccessToken/);
  });
});
