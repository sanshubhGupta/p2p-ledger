import { useState, useCallback, useEffect } from 'react';
import { fetchWalletBalance, login } from './api';
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

function LoginScreen({ onLogin, loggingIn, loginError }) {
  return (
    <div className="app">
      <header className="masthead">
        <p className="masthead-eyebrow">P2P Ledger</p>
        <h1>Log in</h1>
      </header>

      <p className="status-line" style={{ marginBottom: 16 }}>
        Demo auth — pick a user, no password required.
      </p>

      <div className="ledger">
        {Object.entries(WALLETS).map(([key, w]) => (
          <button
            key={key}
            className="refresh-btn"
            disabled={loggingIn}
            onClick={() => onLogin(key)}
          >
            {loggingIn ? 'Logging in…' : `Log in as ${w.name}`}
          </button>
        ))}
      </div>

      {loginError && <p className="status-line error">{loginError}</p>}
    </div>
  );
}

export default function App() {
  const [currentUserKey, setCurrentUserKey] = useState(null);
  const [token, setToken] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);

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

  const handleLogin = async (key) => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const t = await login(WALLETS[key].userId);
      setToken(t);
      setCurrentUserKey(key);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUserKey(null);
  };

  useEffect(() => {
    if (!currentUserKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on login
    loadBalances();
  }, [currentUserKey, loadBalances]);

  if (!currentUserKey) {
    return <LoginScreen onLogin={handleLogin} loggingIn={loggingIn} loginError={loginError} />;
  }

  return (
    <div className="app">
      <header className="masthead">
        <p className="masthead-eyebrow">P2P Ledger</p>
        <h1>Wallet Dashboard</h1>
        <p className="status-line">
          Logged in as {WALLETS[currentUserKey].name}{' '}
          <button className="refresh-btn" style={{ marginLeft: 8 }} onClick={handleLogout}>
            Switch user
          </button>
        </p>
      </header>

      <div className="ledger">
        <WalletCard wallet={WALLETS.alice} {...alice} />
        <WalletCard wallet={WALLETS.bob} {...bob} />
      </div>

      <TransferForm
        onTransferComplete={loadBalances}
        token={token}
        currentUserKey={currentUserKey}
      />

      <LiveFeed />

      <StressTest onComplete={loadBalances} token={token} currentUserKey={currentUserKey} />

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