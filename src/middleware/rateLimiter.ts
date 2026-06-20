import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

// ⚠ SECURITY: In production, userId MUST come from a verified JWT payload
// (not req.body or req.params) — anyone can forge a userId and bypass this limiter.
export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.body?.userId || req.params?.userId;

  if (!userId) {
    next();
    return;
  }

  const key = 'ratelimit:' + userId;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  const results = await pipeline.exec();

  const count = results?.[0]?.[1] as number;

  if (count === 1) {
    await redis.expire(key, 60);
  }

  if (count > 5) {
    res.status(429).json({
      error: 'Rate limit exceeded. Max 5 transactions per minute.',
    });
    return;
  }

  next();
};
