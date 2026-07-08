import { Prisma } from '../../generated/prisma/client/client';

const mockTx = {
  wallet: {
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  transaction: {
    create: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((callback: any) => callback(mockTx)),
  },
}));

import { executeTransfer } from '../TransactionService';

describe('executeTransfer', () => {
  const senderWalletId = 'sender-wallet-id';
  const receiverWalletId = 'receiver-wallet-id';

  it('successfully transfers funds and updates both balances correctly', async () => {
    mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
      balance: new Prisma.Decimal('100.00'),
      version: 0,
    });
    mockTx.wallet.updateMany.mockResolvedValue({ count: 1 });
    mockTx.wallet.update.mockResolvedValue({});
    mockTx.transaction.create.mockResolvedValue({
      id: 'tx-1',
      status: 'SUCCESS',
      amount: new Prisma.Decimal('30.00'),
      senderWalletId,
      receiverWalletId,
      idempotencyKey: null,
      createdAt: new Date(),
    });

    const result = await executeTransfer(senderWalletId, receiverWalletId, '30.00');

    expect(mockTx.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: senderWalletId, version: 0 },
      data: expect.objectContaining({
        balance: expect.any(Prisma.Decimal),
        version: { increment: 1 },
      }),
    });
    const senderCallArgs = mockTx.wallet.updateMany.mock.calls[0][0];
    expect(senderCallArgs.data.balance.toString()).toBe('70');

    expect(mockTx.wallet.update).toHaveBeenCalledWith({
      where: { id: receiverWalletId },
      data: expect.objectContaining({
        balance: { increment: expect.any(Prisma.Decimal) },
        version: { increment: 1 },
      }),
    });
    const receiverCallArgs = mockTx.wallet.update.mock.calls[0][0];
    expect(receiverCallArgs.data.balance.increment.toString()).toBe('30');

    expect(mockTx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'SUCCESS',
        senderWalletId,
        receiverWalletId,
      }),
    });

    expect(result.id).toBe('tx-1');
  });

  it('rejects an over-limit transfer without modifying any balance', async () => {
    mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
      balance: new Prisma.Decimal('10.00'),
      version: 0,
    });

    await expect(
      executeTransfer(senderWalletId, receiverWalletId, '500.00')
    ).rejects.toThrow('Insufficient funds');

    expect(mockTx.wallet.updateMany).not.toHaveBeenCalled();
    expect(mockTx.wallet.update).not.toHaveBeenCalled();
    expect(mockTx.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a zero or negative amount', async () => {
    mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
      balance: new Prisma.Decimal('100.00'),
      version: 0,
    });

    await expect(
      executeTransfer(senderWalletId, receiverWalletId, '0')
    ).rejects.toThrow('Amount must be positive');

    expect(mockTx.wallet.updateMany).not.toHaveBeenCalled();
  });
});