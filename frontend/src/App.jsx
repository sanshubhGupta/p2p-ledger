import { useState, useCallback, useEffect } from 'react';
import { fetchWalletBalance } from './api';
import { WALLETS } from './wallets';
import TransferForm from './TransferForm';
import LiveFeed from './LiveFeed';
import StressTest from './StressTest';

function WalletCard({ wallet, balance, previousBalance, source, error }) {
  const delta = previousBalance !== null && balance !== null
    ? (parseFloat(balance) - parseFloat(previousBalance))
    : null;

  return (
    <div className="ledger-card">
      <p className="ledger-name">{wallet.name}</p>
      <p className="ledger-id">{wallet.id}</p>
      {error ? (
        <p className="status-line error">Could not load balance</p>
      ) : (
        <>
          <div className="ledger-balance">
            {balance !== null ? Number(balance).toFixed(2) : '—'}
          </div>
          {source && <p className="ledger-source">source: {source}</p>}
          {delta !== null && delta !== 0 && (
            <p className={`ledger-delta ${delta > 0 ? 'credit' : 'debit'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(2)} since last refresh
            </p>
          )}
        </>
      )}
    </div>
  );
}

const INITIAL_WALLET_STATE = {
  balance: null,
  previousBalance: null,
  source: null,
  error: false,
};

export default function App() {
  const [alice, setAlice] = useState(INITIAL_WALLET_STATE);
  const [bob, setBob] = useState(INITIAL_WALLET_STATE);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadBalances = useCallback(() => {
    setLoading(true);

    Promise.allSettled([
      fetchWalletBalance(WALLETS.alice.id),
      fetchWalletBalance(WALLETS.bob.id),
    ]).then(([aliceResult, bobResult]) => {
      setAlice((prev) => ({
        balance: aliceResult.status === 'fulfilled' ? aliceResult.value.balance : prev.balance,
        previousBalance: prev.balance,
        source: aliceResult.status === 'fulfilled' ? aliceResult.value.source : null,
        error: aliceResult.status === 'rejected',
      }));
      setBob((prev) => ({
        balance: bobResult.status === 'fulfilled' ? bobResult.value.balance : prev.balance,
        previousBalance: prev.balance,
        source: bobResult.status === 'fulfilled' ? bobResult.value.source : null,
        error: bobResult.status === 'rejected',
      }));
      setLastUpdated(new Date());
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional initial fetch on mount
    loadBalances();
  }, [loadBalances]);

  return (
    <div className="app">
      <header className="masthead">
        <p className="masthead-eyebrow">P2P Ledger</p>
        <h1>Wallet Dashboard</h1>
      </header>

      <div className="ledger">
        <WalletCard wallet={WALLETS.alice} {...alice} />
        <WalletCard wallet={WALLETS.bob} {...bob} />
      </div>

      <TransferForm onTransferComplete={loadBalances} />

      <LiveFeed />

      <StressTest onComplete={loadBalances} />

      <button className="refresh-btn" onClick={loadBalances} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh balances'}
      </button>

      {lastUpdated && (
        <p className="status-line">
          Last updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}