import { Request, Response } from 'express';
import { executeTransfer } from '../services/TransactionService';
import { invalidateWalletCache, getWalletOwnerId } from '../services/WalletService';
import { addNotificationJob } from '../queues/notificationQueue';
import { io } from '../index';
import { NotificationService } from '../socket/NotificationService';
import redis from '../config/redis';

const VALIDATION_ERRORS = new Set([
  'Amount must be positive',
  'Insufficient funds',
  'Concurrent modification detected - please retry',
]);

export const transferHandler = async (req: Request, res: Response): Promise<void> => {
  const { senderWalletId, receiverWalletId, amount, idempotencyKey } = req.body as {
    senderWalletId: string;
    receiverWalletId: string;
    amount: string;
    idempotencyKey?: string;
  };

  if (!senderWalletId || !receiverWalletId || amount === undefined || amount === null) {
    res.status(400).json({ error: 'senderWalletId, receiverWalletId, and amount are required' });
    return;
  }

  try {
    const ownerId = await getWalletOwnerId(senderWalletId);
    if (!req.user || req.user.userId !== ownerId) {
      res.status(403).json({ error: 'You can only transfer from your own wallet' });
      return;
    }

    const transaction = await executeTransfer(
      senderWalletId,
      receiverWalletId,
      String(amount),
      idempotencyKey
    );

    await invalidateWalletCache([senderWalletId, receiverWalletId]);

    if (idempotencyKey) {
      await redis.set(
        `idempotency:${idempotencyKey}`,
        JSON.stringify({ transaction }),
        'EX',
        86400
      );
    }

    NotificationService.emitBalanceUpdate(io, senderWalletId, 'updated');
    NotificationService.emitBalanceUpdate(io, receiverWalletId, 'updated');

    NotificationService.emitTransactionCompleted(io, {
      ...transaction,
      amount: transaction.amount.toString(),
    });

    addNotificationJob({
      transactionId: transaction.id,
      senderEmail: 'sender@example.com',
      receiverEmail: 'receiver@example.com',
      amount: String(amount),
      timestamp: transaction.createdAt.toISOString(),
    });

    res.status(200).json({ transaction });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (VALIDATION_ERRORS.has(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }

      if (
        error.message.includes('Unique constraint failed') &&
        error.message.includes('idempotencyKey')
      ) {
        res.status(400).json({ error: 'Duplicate request: this idempotency key was already used' });
        return;
      }
    }

    console.error('[transferHandler] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};