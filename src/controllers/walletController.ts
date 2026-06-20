import { Request, Response } from 'express';
import { getWalletBalance, depositToWallet } from '../services/WalletService';

export const getBalanceHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    const result = await getWalletBalance(id);
    res.status(200).json(result);
  } catch (error: unknown) {
    console.error('[getBalanceHandler] Error:', error);
    res.status(404).json({ error: 'Wallet not found' });
  }
};

export const depositHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { amount } = req.body as { amount: string };

  if (amount === undefined || amount === null) {
    res.status(400).json({ error: 'amount is required' });
    return;
  }

  try {
    const wallet = await depositToWallet(id, String(amount));
    res.status(200).json({ wallet });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Amount must be positive') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[depositHandler] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
