import { Router } from 'express';
import { transferHandler } from '../controllers/transferController';
import { distributedLockMiddleware } from '../middleware/distributedLock';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';

const router = Router();

router.post('/', rateLimiterMiddleware, distributedLockMiddleware, transferHandler);

export default router;
