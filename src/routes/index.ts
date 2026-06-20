import { Router } from 'express';
import transferRoutes from './transferRoutes';
import walletRoutes from './walletRoutes';

const router = Router();

router.use('/transfer', transferRoutes);
router.use('/wallet', walletRoutes);

export default router;
