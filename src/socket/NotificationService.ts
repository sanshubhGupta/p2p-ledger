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

  // Broadcasts a completed transfer to ALL connected clients — used for the
  // public live transaction feed, unlike emitBalanceUpdate which only
  // notifies the specific sender/receiver.
  static emitTransactionCompleted(
    io: Server,
    transaction: {
      id: string;
      senderWalletId: string;
      receiverWalletId: string;
      amount: string;
      createdAt: Date;
    }
  ): void {
    io.emit('transaction_completed', {
      transactionId: transaction.id,
      senderWalletId: transaction.senderWalletId,
      receiverWalletId: transaction.receiverWalletId,
      amount: transaction.amount,
      timestamp: transaction.createdAt.toISOString(),
    });
  }
}