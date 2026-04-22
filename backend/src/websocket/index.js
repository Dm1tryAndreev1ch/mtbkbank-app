const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;
const connectedUsers = new Map(); // userId -> socketId

function setupWebSockets(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // JWT Middleware validation
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      socket.user = decoded; // { id, phone }
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket Connected: ${socket.id} (User: ${socket.user.id})`);
    
    connectedUsers.set(socket.user.id, socket.id);

    socket.on('disconnect', () => {
      console.log(`❌ Socket Disconnected: ${socket.id}`);
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

