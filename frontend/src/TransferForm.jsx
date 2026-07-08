import { useState } from 'react';
import { submitTransfer } from './api';
import { WALLETS } from './wallets';

const WALLET_ENTRIES = Object.entries(WALLETS);

export default function TransferForm({ onTransferComplete, token, currentUserKey }) {
  const fromKey = currentUserKey;
  const [toKey, setToKey] = useState(
    Object.keys(WALLETS).find((k) => k !== currentUserKey)
  );
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);

    if (fromKey === toKey) {
      setResult({ type: 'error', message: 'Sender and receiver must be different wallets' });
      return;
    }
    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      setResult({ type: 'error', message: 'Enter a valid amount greater than 0' });
      return;
    }

    setSubmitting(true);
    try {
      const { transaction } = await submitTransfer(
        WALLETS[fromKey].id,
        WALLETS[toKey].id,
        numericAmount,
        token
      );
      setResult({
        type: 'success',
        message: `Transferred ${transaction.amount} from ${WALLETS[fromKey].name} to ${WALLETS[toKey].name}`,
      });
      setAmount('');
      onTransferComplete();
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="transfer-form" onSubmit={handleSubmit}>
      <p className="masthead-eyebrow" style={{ marginBottom: 16 }}>New Transfer</p>

      <div className="form-row">
        <label htmlFor="from-wallet">From</label>
        <select id="from-wallet" value={fromKey} disabled>
          {WALLET_ENTRIES.map(([key, w]) => (
            <option key={key} value={key}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="to-wallet">To</label>
        <select id="to-wallet" value={toKey} onChange={(e) => setToKey(e.target.value)}>
          {WALLET_ENTRIES
            .filter(([key]) => key !== fromKey)
            .map(([key, w]) => (
              <option key={key} value={key}>{w.name}</option>
            ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <button type="submit" className="refresh-btn" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send transfer'}
      </button>

      {result && (
        <p className={`status-line ${result.type === 'error' ? 'error' : 'success'}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}