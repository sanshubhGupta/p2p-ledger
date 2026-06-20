import { Server } from 'socket.io';
import { userSocketMap } from './index';

export class NotificationService {
  static emitBalanceUpdate(io: Server, userId: string, newBalance: string): void {
    const socketId = userSocketMap.get(userId);

    if (socketId) {
      io.to(socketId).emit('balance_updated', {
        userId,
        newBalance,
        timestamp: new Date().toISOString(),
      });
      console.log('Balance update emitted to user:', userId, 'newBalance:', newBalance);
    } else {
      console.log('User', userId, 'not connected — skipping real-time notification');
    }
  }
}
