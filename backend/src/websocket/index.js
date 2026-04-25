const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('../logger');

let io;
const connectedUsers = new Map(); // userId -> socketId

function setupWebSockets(server) {
  io = new Server(server, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000')
        .split(',').map(o => o.trim()).filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  // JWT Middleware validation
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    try {
      if (!process.env.JWT_SECRET) {
        return next(new Error('JWT_SECRET not configured'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // { id, phone }
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.user.id },
      '🔌 Socket Connected'
    );

    connectedUsers.set(socket.user.id, socket.id);

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, '❌ Socket Disconnected');
      connectedUsers.delete(socket.user.id);
    });
  });
}

function broadcastToUser(userId, eventName, payload) {
  if (!io) return;
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit(eventName, payload);
  }
}

function broadcastToAll(eventName, payload) {
  if (!io) return;
  io.emit(eventName, payload);
}

function broadcastToMany(userIds, eventName, payload) {
  if (!io) return;
  for (const userId of userIds) {
    const socketId = connectedUsers.get(userId);
    if (socketId) {
      io.to(socketId).emit(eventName, payload);
    }
  }
}

module.exports = {
  setupWebSockets,
  broadcastToUser,
  broadcastToAll,
  broadcastToMany,
};

