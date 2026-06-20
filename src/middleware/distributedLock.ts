import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

interface RequestWithLock extends Request {
  lockKey?: string;
}

export const distributedLockMiddleware = async (
  req: RequestWithLock,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { senderWalletId } = req.body;

  if (!senderWalletId) {
    next();
    return;
  }

  const lockKey = 'lock:wallet:' + senderWalletId;

  const result = await redis.set(lockKey, '1', 'EX', 5, 'NX');

  if (result === null) {
    res.status(429).json({
      error: 'Transaction already in progress. Please try again in a moment.',
    });
    return;
  }

  req.lockKey = lockKey;
  res.on('finish', async () => {
    await redis.del(lockKey);
  });

  next();
};
