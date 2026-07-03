import { useState } from 'react';
import { WALLETS } from './wallets';
import { fetchWalletBalance } from './api';

const BASE_URL = 'http://localhost:3000/api';
const REQUEST_COUNT = 10;
const AMOUNT_PER_REQUEST = 200; // deliberately large so 10x would overdraw a 1000 balance

async function fireTransfer(requestNumber) {
  try {
    const res = await fetch(`${BASE_URL}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(), // unique per request — required
      },
      body: JSON.stringify({
        senderWalletId: WALLETS.alice.id,
        receiverWalletId: WALLETS.bob.id,
        amount: String(AMOUNT_PER_REQUEST),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return { requestNumber, status: 'success', transactionId: data.transaction.id };
  } catch (err) {
    return { requestNumber, status: 'failed', message: err.message };
  }
}

export default function StressTest({ onComplete }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [finalBalance, setFinalBalance] = useState(null);

  const runStressTest = async () => {
    setRunning(true);
    setResults([]);
    setFinalBalance(null);

    const settled = await Promise.allSettled(
      Array.from({ length: REQUEST_COUNT }, (_, i) => fireTransfer(i + 1))
    );

    const outcomes = settled.map((s) => (s.status === 'fulfilled' ? s.value : {
      requestNumber: '?', status: 'failed', message: s.reason?.message ?? 'Unknown error',
    }));
    outcomes.sort((a, b) => a.requestNumber - b.requestNumber);
    setResults(outcomes);

    // Confirm the balance directly from the source of truth, not by trusting our own math
    try {
      const { balance } = await fetchWalletBalance(WALLETS.alice.id);
      setFinalBalance(balance);
    } catch {
      setFinalBalance(null);
    }

    setRunning(false);
    onComplete?.();
  };

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const negativeBalance = finalBalance !== null && parseFloat(finalBalance) < 0;

  return (
    <div className="stress-test">
      <p className="masthead-eyebrow">Concurrency Stress Test</p>
      <p className="status-line" style={{ marginTop: 0, marginBottom: 16 }}>
        Fires {REQUEST_COUNT} simultaneous transfers of {AMOUNT_PER_REQUEST} each from Alice to
        Bob. The distributed lock allows only one to process at a time — the rest are safely
        rejected with 429, not queued. This proves Alice's balance can never go negative even
        under concurrent load.
      </p>

      <button className="refresh-btn" onClick={runStressTest} disabled={running}>
        {running ? 'Firing requests…' : `Fire ${REQUEST_COUNT} concurrent transfers`}
      </button>

      {results.length > 0 && (
        <>
          <ul className="stress-list">
            {results.map((r) => (
              <li key={r.requestNumber} className={`stress-item ${r.status}`}>
                <span className="stress-num">#{r.requestNumber}</span>
                <span className="stress-status">{r.status === 'success' ? 'SUCCESS' : 'REJECTED'}</span>
                <span className="stress-detail">
                  {r.status === 'success' ? `tx ${r.transactionId.slice(0, 8)}` : r.message}
                </span>
              </li>
            ))}
          </ul>

          <p className={`status-line ${negativeBalance ? 'error' : 'success'}`}>
            {succeeded} succeeded, {failed} rejected — final balance{' '}
            {finalBalance !== null ? Number(finalBalance).toFixed(2) : '(unavailable)'}
            {finalBalance !== null && (negativeBalance
              ? ' — WENT NEGATIVE (lock failed)'
              : ' — confirmed never negative')}
          </p>
        </>
      )}
    </div>
  );
}