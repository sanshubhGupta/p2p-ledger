import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const loginHandler = (req: Request, res: Response): void => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const token = jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    expiresIn: '24h',
  });

  res.status(200).json({ token });
};