// Idempotency-Key middleware — deduplicates retried requests
import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const key = req.headers['idempotency-key'];

  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'Idempotency-Key header is required' });
    return;
  }

  try {
    const cached = await redis.get(`idempotency:${key}`);

    if (cached) {
      res.status(200).json(JSON.parse(cached));
      return;
    }

    req.body.idempotencyKey = key;
    next();
  } catch (error) {
    console.error('[idempotencyMiddleware] Redis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};