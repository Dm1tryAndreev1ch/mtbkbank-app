// backend/src/websocket/index.js
// Phase 3 / REL-09 / SEC-11 — rooms refactor + shared JWT verifier + env reads.
//
// Replaces the legacy in-memory userId->socketId Map with Socket.IO rooms
// (`user:{id}`). On connect the socket joins its user room; broadcasts emit
// via io.to(room).emit(...). Reconnect produces exactly one delivery per emit
// (Socket.IO 4.x rooms auto-clean on disconnect — Pitfall 5).
//
// JWT verification is delegated to verifyAccessToken from middleware/auth.js so
// HTTP and WS share a single envalid-validated env.JWT_SECRET source.

const { Server } = require('socket.io');
const { logger } = require('../logger');
const { env } = require('../env');
const { verifyAccessToken } = require('../middleware/auth');

let io;

function setupWebSockets(server) {
  io = new Server(server, {
    cors: {
      origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      logger.warn(
        { event: 'ws_handshake_no_token', socketId: socket.id },
        'WS rejected: no token'
      );
      return next(new Error('AUTH_TOKEN_INVALID'));
    }
    try {
      const decoded = verifyAccessToken(token); // shared verifier; env.JWT_SECRET; throws
      socket.user = { id: decoded.userId, isAdmin: !!decoded.isAdmin };
      next();
    } catch (err) {
      logger.warn(
        { event: 'ws_handshake_invalid_token', socketId: socket.id, reason: err.message },
        'WS rejected: invalid token'
      );
      next(new Error('AUTH_TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`); // REL-09 — replaces in-memory Map
    logger.info({ socketId: socket.id, userId }, 'socket_connected');

    socket.on('disconnect', () => {
      // Socket.IO v4 auto-leaves all rooms on disconnect (Pitfall 5).
      logger.info({ socketId: socket.id, userId }, 'socket_disconnected');
    });
  });
}

function broadcastToUser(userId, eventName, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(eventName, payload);
}

function broadcastToAll(eventName, payload) {
  if (!io) return;
  io.emit(eventName, payload);
}

function broadcastToMany(userIds, eventName, payload) {
  if (!io) return;
  for (const userId of userIds) {
    io.to(`user:${userId}`).emit(eventName, payload);
  }
}

module.exports = {
  setupWebSockets,
  broadcastToUser,
  broadcastToAll,
  broadcastToMany,
};
