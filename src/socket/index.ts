import { Server } from 'socket.io';
import http from 'http';

export const userSocketMap = new Map<string, string>();

export function initializeSocket(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string;

    if (userId) {
      userSocketMap.set(userId, socket.id);
      console.log('User connected:', userId, 'socketId:', socket.id);
    }

    socket.on('disconnect', () => {
      if (userId) userSocketMap.delete(userId);
      console.log('User disconnected:', userId);
    });
  });

  return io;
}
