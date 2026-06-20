// Wallet operations — balance read with Redis cache, deposit
import prisma from '../config/database';
import redis from '../config/redis';
import { Prisma } from '../generated/prisma/client/client';

export const getWalletBalance = async (
  walletId: string
): Promise<{ balance: string; source: 'cache' | 'database' }> => {
  const cacheKey = 'wallet:balance:' + walletId;

  // Cache check
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return { balance: cached, source: 'cache' };
  }

  // Cache miss — query DB
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { balance: true },
  });

  const balanceStr = wallet.balance.toString();

  // Store in cache with 10 min TTL
  await redis.set(cacheKey, balanceStr, 'EX', 600);

  return { balance: balanceStr, source: 'database' };
};

export const invalidateWalletCache = async (walletIds: string[]): Promise<void> => {
  if (walletIds.length === 0) return;
  const keys = walletIds.map((id) => 'wallet:balance:' + id);
  await redis.del(...keys);
};

export const depositToWallet = async (walletId: string, amount: string) => {
  const decimalAmount = new Prisma.Decimal(amount);

  if (!decimalAmount.greaterThan(new Prisma.Decimal(0))) {
    throw new Error('Amount must be positive');
  }

  const wallet = await prisma.wallet.update({
    where: { id: walletId },
    data: {
      balance: { increment: decimalAmount },
      version: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  await invalidateWalletCache([walletId]);

  return wallet;
};
