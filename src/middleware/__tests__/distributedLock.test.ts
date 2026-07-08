import type { Request, Response, NextFunction } from 'express';
import { distributedLockMiddleware } from '../distributedLock';
import redis from '../../config/redis';

function makeReq(senderWalletId: string): Request {
  return { body: { senderWalletId } } as unknown as Request;
}

function makeRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.on = jest.fn();
  return res as Response;
}

describe('distributedLockMiddleware', () => {
  const walletId = 'stress-test-wallet-' + Date.now();
  const lockKey = 'lock:wallet:' + walletId;

  afterEach(async () => {
    await redis.del(lockKey);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('allows exactly one of two concurrent lock attempts to succeed', async () => {
    const req1 = makeReq(walletId);
    const req2 = makeReq(walletId);
    const res1 = makeRes();
    const res2 = makeRes();
    const next1: NextFunction = jest.fn();
    const next2: NextFunction = jest.fn();

    await Promise.all([
      distributedLockMiddleware(req1, res1, next1),
      distributedLockMiddleware(req2, res2, next2),
    ]);

    const nextCallCount =
      (next1 as jest.Mock).mock.calls.length + (next2 as jest.Mock).mock.calls.length;

    const rejected429Count = [res1, res2].filter((res) =>
      (res.status as jest.Mock).mock.calls.some((call) => call[0] === 429)
    ).length;

    expect(nextCallCount).toBe(1);
    expect(rejected429Count).toBe(1);
  });

  it('releases the lock so a subsequent request can acquire it', async () => {
    await redis.set(lockKey, '1', 'EX', 5, 'NX');

    const reqBlocked = makeReq(walletId);
    const resBlocked = makeRes();
    await distributedLockMiddleware(reqBlocked, resBlocked, jest.fn());
    expect(resBlocked.status).toHaveBeenCalledWith(429);

    await redis.del(lockKey);

    const reqAfterRelease = makeReq(walletId);
    const resAfterRelease = makeRes();
    const nextAfterRelease = jest.fn();
    await distributedLockMiddleware(reqAfterRelease, resAfterRelease, nextAfterRelease);
    expect(nextAfterRelease).toHaveBeenCalled();
  });
});