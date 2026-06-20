import { Prisma, Transaction } from '../generated/prisma/client/client';
import prisma from '../config/database';

/**
 * Result type returned by executeTransfer.
 * Matches the Prisma-generated Transaction model exactly.
 */
export type TransferResult = Transaction;

/**
 * Executes a P2P money transfer atomically inside a Prisma ACID transaction.
 *
 * Steps (all succeed or all roll back):
 *   1. Fetch sender wallet (balance + version)
 *   2. Validate amount > 0
 *   3. Validate sender balance ≥ amount
 *   4. Deduct from sender with optimistic locking (WHERE version = currentVersion)
 *   5. Credit receiver
 *   6. Write immutable Transaction ledger record
 *   7. Return the created Transaction record
 *
 * @param senderWalletId   UUID of the sender's wallet
 * @param receiverWalletId UUID of the receiver's wallet
 * @param amount           Transfer amount as a string (converted to Prisma.Decimal internally)
 * @param idempotencyKey   Optional unique key to deduplicate retried requests
 * @throws Error('Amount must be positive')                          — amount ≤ 0
 * @throws Error('Insufficient funds')                               — balance too low
 * @throws Error('Concurrent modification detected - please retry')  — optimistic lock conflict
 */
export async function executeTransfer(
  senderWalletId: string,
  receiverWalletId: string,
  amount: string,
  idempotencyKey?: string
): Promise<TransferResult> {
  return prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    // ── 1. Fetch sender wallet ────────────────────────────────────────────────
    // findUniqueOrThrow throws Prisma.PrismaClientKnownRequestError (P2025)
    // if the wallet doesn't exist, which bubbles up as a 500.
    const senderWallet = await tx.wallet.findUniqueOrThrow({
      where: { id: senderWalletId },
      select: { balance: true, version: true },
    });

    const decimalAmount = new Prisma.Decimal(amount);

    // ── 2. Validate amount > 0 ────────────────────────────────────────────────
    if (!decimalAmount.greaterThan(new Prisma.Decimal(0))) {
      throw new Error('Amount must be positive');
    }

    // ── 3. Validate sender has enough funds ───────────────────────────────────
    if (!senderWallet.balance.greaterThanOrEqualTo(decimalAmount)) {
      throw new Error('Insufficient funds');
    }

    const currentVersion = senderWallet.version;
    const newSenderBalance = senderWallet.balance.minus(decimalAmount);

    // ── 4. Deduct from sender with optimistic locking ─────────────────────────
    // updateMany lets us include `version` in the WHERE clause.
    // If another request already incremented the version, count === 0.
    const senderUpdateResult = await tx.wallet.updateMany({
      where: {
        id: senderWalletId,
        version: currentVersion, // ← optimistic lock guard
      },
      data: {
        balance: newSenderBalance,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    if (senderUpdateResult.count === 0) {
      // Version mismatch: another request committed in between our read and write.
      throw new Error('Concurrent modification detected - please retry');
    }
    // throw new Error('test rollback');//TEMPORARY TEST LINE

    // ── 5. Credit receiver ────────────────────────────────────────────────────
    // We don't need optimistic locking on the receiver — only the sender's
    // debit path needs the version guard to prevent double-spend.
    await tx.wallet.update({
      where: { id: receiverWalletId },
      data: {
        balance: { increment: decimalAmount },
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // ── 6. Create immutable Transaction ledger record ─────────────────────────
    const transaction = await tx.transaction.create({
      data: {
        status: 'SUCCESS',
        amount: decimalAmount,
        senderWalletId,
        receiverWalletId,
        // idempotencyKey is @unique in the schema — Prisma enforces no duplicates.
        ...(idempotencyKey !== undefined && { idempotencyKey }),
      },
    });

    // ── 7. Return the committed transaction record ────────────────────────────
    return transaction;
  });
}