import { Request, Response } from 'express';
import { executeTransfer } from '../services/TransactionService';
import { invalidateWalletCache } from '../services/WalletService';
import { addNotificationJob } from '../queues/notificationQueue';
import { io } from '../index';
import { NotificationService } from '../socket/NotificationService';

/**
 * Known business-rule error messages thrown by executeTransfer.
 * Any of these → HTTP 400 (client error, not a server fault).
 */
const VALIDATION_ERRORS = new Set([
  'Amount must be positive',
  'Insufficient funds',
  'Concurrent modification detected - please retry',
]);

/**
 * POST /api/transfer
 *
 * Body:
 *   senderWalletId   string  — UUID of sender's wallet
 *   receiverWalletId string  — UUID of receiver's wallet
 *   amount           string  — Transfer amount (treated as Prisma.Decimal)
 *   idempotencyKey   string? — Optional deduplication key
 *
 * Responses:
 *   200 { transaction }            — Transfer committed successfully
 *   400 { error: string }          — Validation failure (bad amount, insufficient funds, etc.)
 *   500 { error: 'Internal server error' } — Unexpected system error
 */
export const transferHandler = async (req: Request, res: Response): Promise<void> => {
  const { senderWalletId, receiverWalletId, amount, idempotencyKey } = req.body as {
    senderWalletId: string;
    receiverWalletId: string;
    amount: string;
    idempotencyKey?: string;
  };

  // ── Basic presence checks ─────────────────────────────────────────────────
  if (!senderWalletId || !receiverWalletId || amount === undefined || amount === null) {
    res.status(400).json({ error: 'senderWalletId, receiverWalletId, and amount are required' });
    return;
  }

  try {
    // ── Execute the ACID transfer ─────────────────────────────────────────────
    const transaction = await executeTransfer(
      senderWalletId,
      receiverWalletId,
      String(amount),        // normalise in case a number was sent
      idempotencyKey
    );

    // ── Invalidate Redis balance cache for both wallets ───────────────────────
    // This ensures the next balance read hits the DB and returns fresh data.
    // Runs after commit — no point invalidating if the transaction rolled back.
    await invalidateWalletCache([senderWalletId, receiverWalletId]);

    // Real-time balance update via WebSocket
    NotificationService.emitBalanceUpdate(io, senderWalletId, 'updated');
    NotificationService.emitBalanceUpdate(io, receiverWalletId, 'updated');

    // Fire and forget — do NOT await, runs in background
    addNotificationJob({
      transactionId: transaction.id,
      senderEmail: 'sender@example.com',
      receiverEmail: 'receiver@example.com',
      amount: String(amount),
      timestamp: transaction.createdAt.toISOString(),
    });

    res.status(200).json({ transaction });
  } catch (error: unknown) {
    // ── Distinguish business-rule errors (400) from system errors (500) ───────
    if (error instanceof Error) {
      if (VALIDATION_ERRORS.has(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }

      // Prisma unique-constraint violation on idempotencyKey → treat as duplicate request
      if (
        error.message.includes('Unique constraint failed') &&
        error.message.includes('idempotencyKey')
      ) {
        res.status(400).json({ error: 'Duplicate request: this idempotency key was already used' });
        return;
      }
    }

    // Anything else is unexpected — log it, hide internals from the client
    console.error('[transferHandler] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};