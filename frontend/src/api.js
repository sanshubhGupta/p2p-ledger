const BASE_URL = 'http://localhost:3000/api';

export async function login(userId) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Login failed (${res.status})`);
  }

  return data.token;
}

export async function fetchWalletBalance(walletId) {
  const res = await fetch(`${BASE_URL}/wallet/${walletId}/balance`);
  if (!res.ok) {
    throw new Error(`Failed to fetch balance (${res.status})`);
  }
  return res.json();
}

export async function submitTransfer(senderWalletId, receiverWalletId, amount, token) {
  const res = await fetch(`${BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ senderWalletId, receiverWalletId, amount: String(amount) }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Transfer failed (${res.status})`);
  }

  return data;
}