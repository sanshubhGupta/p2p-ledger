declare global {
  namespace Express {
    interface Request {
      lockKey?: string;
    }
  }
}

export {};
