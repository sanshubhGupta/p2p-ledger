import { Router } from 'express';
import { getBalanceHandler, depositHandler } from '../controllers/walletController';

const router = Router();

router.get('/:id/balance', getBalanceHandler);
router.post('/:id/deposit', depositHandler);

export default router;
