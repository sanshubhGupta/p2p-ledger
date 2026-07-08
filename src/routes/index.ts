import { Router } from 'express';
import authRoutes from './authRoutes';
import transferRoutes from './transferRoutes';
import walletRoutes from './walletRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/transfer', transferRoutes);
router.use('/wallet', walletRoutes);

export default router;