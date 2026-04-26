/**
 * Phase 3 — Plan 03-12 — REL-09 live tests.
 *
 * Socket.IO rooms refactor: connectedUsers Map deleted; on connect socket
 * joins user:{id}; broadcastToUser/broadcastToMany emit via io.to(room).
 */

const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
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

describe('Socket.IO rooms refactor (REL-09)', () => {
  it('connectedUsers Map reference is gone from backend/src/websocket/index.js (regression-guard pin)', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync('src/websocket/index.js', 'utf8');
    expect(src).not.toMatch(/connectedUsers\s*=\s*new Map/);
  });

  it('on connect socket joins room user:{userId}; broadcastToUser delivers via room', async () => {
    const u = await prisma.user.create({
      data: { phone: '+79991111130', pin: 'h', name: 'A' },
    });
    const token = jwt.sign(
      { userId: u.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const client = ioc(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const received = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 3000);
      client.on('connect', () => {
        client.on('TEST_EVENT', (data) => {
          clearTimeout(t);
          resolve(data);
        });
        // Wait briefly so server-side join completes, then trigger broadcast.
        setTimeout(() => {
          const { broadcastToUser } = require('../../src/websocket');
          broadcastToUser(u.id, 'TEST_EVENT', { hello: 'world' });
        }, 100);
      });
      client.on('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
    expect(received.hello).toBe('world');
    client.disconnect();
  });

  it('reconnect produces single broadcast event on receiver (no double-emit, Pitfall 5)', async () => {
    const u = await prisma.user.create({
      data: { phone: '+79991111131', pin: 'h', name: 'B' },
    });
    const token = jwt.sign(
      { userId: u.id, isAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    let count = 0;
    const client = ioc(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise((r) => client.on('connect', r));
    client.on('PING', () => {
      count++;
    });
    client.disconnect();
    await new Promise((r) => setTimeout(r, 150));

    client.connect();
    await new Promise((r) => client.on('connect', r));

    const { broadcastToUser } = require('../../src/websocket');
    broadcastToUser(u.id, 'PING', {});
    await new Promise((r) => setTimeout(r, 250));
    expect(count).toBe(1); // single emit, no double-delivery from stale Map
    client.disconnect();
  });
});
