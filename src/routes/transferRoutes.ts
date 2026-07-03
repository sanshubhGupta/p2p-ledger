import { Router } from 'express';
import { transferHandler } from '../controllers/transferController';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { distributedLockMiddleware } from '../middleware/distributedLock';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';

const router = Router();

router.post('/', idempotencyMiddleware, rateLimiterMiddleware, distributedLockMiddleware, transferHandler);

export default router;