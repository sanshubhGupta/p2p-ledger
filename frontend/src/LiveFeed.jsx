import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { WALLETS } from './wallets';

const SOCKET_URL = 'http://localhost:3000';
const MAX_ENTRIES = 20;

function shortId(id) {
  return id ? id.slice(0, 8) : '—';
}

function nameForWallet(id) {
  const match = Object.values(WALLETS).find((w) => w.id === id);
  return match ? match.name : shortId(id);
}

export default function LiveFeed() {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('transaction_completed', (data) => {
      setEntries((prev) => [data, ...prev].slice(0, MAX_ENTRIES));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="live-feed">
      <div className="live-feed-header">
        <p className="masthead-eyebrow">Live Feed</p>
        <span className={`feed-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● connected' : '○ disconnected'}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="status-line">No transfers yet — send one above.</p>
      ) : (
        <ul className="feed-list">
          {entries.map((entry) => (
            <li key={entry.transactionId} className="feed-item">
              <span className="feed-time">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className="feed-detail">
                {nameForWallet(entry.senderWalletId)} ({shortId(entry.senderWalletId)}) →{' '}
                {nameForWallet(entry.receiverWalletId)} ({shortId(entry.receiverWalletId)})
              </span>
              <span className="feed-amount">{Number(entry.amount).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}