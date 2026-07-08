import { Router } from 'express';
import { transferHandler } from '../controllers/transferController';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { distributedLockMiddleware } from '../middleware/distributedLock';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.post(
  '/',
  authenticateJWT,
  idempotencyMiddleware,
  rateLimiterMiddleware,
  distributedLockMiddleware,
  transferHandler
);

export default router;