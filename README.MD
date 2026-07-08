# P2P Payment Ledger

A backend payment infrastructure system for peer-to-peer money transfers — the same class of engineering problem that powers apps like PhonePe, Razorpay, and Paytm at their core.

Handles ACID-safe transfers, prevents double-spending under concurrent load via distributed locking, rate-limits abusive traffic, deduplicates retried requests via idempotency keys, offloads notification delivery to an async queue, and pushes real-time balance updates to clients over WebSockets.

**Stack:** Node.js · TypeScript · Express · PostgreSQL (Prisma) · Redis · BullMQ · Socket.io · Docker

---

## Architecture
Client (React)
│
▼
Express API ──► JWT Auth ──► Idempotency Check ──► Rate Limiter ──► Distributed Lock
│
▼
Prisma ──► PostgreSQL (wallets, transactions ledger)
│
▼
Redis (distributed lock · rate-limit counters · idempotency cache)
│
▼
BullMQ Queue ──► Worker ──► Socket.io ──► Client (real-time balance + feed updates)

Every transfer request flows through the middleware chain top to bottom before touching the database — auth confirms who's calling, idempotency prevents duplicate processing on retry, the rate limiter blocks abusive traffic, and the distributed lock ensures only one transfer per wallet is ever in flight at a time.

---

## Setup

**Prerequisites:** Docker, Docker Compose, Node.js 20+

```bash
# 1. Clone and install
git clone <repo-url>
cd p2p-ledger
npm install

# 2. Configure environment
cp .env.example .env   # set JWT_SECRET, DATABASE_URL, REDIS_URL

# 3. Start Postgres + Redis (and optionally the app/worker) via Docker
docker compose up -d

# 4. Apply migrations
npx prisma migrate deploy

# 5. Generate Prisma client
npx prisma generate

# 6. Seed demo data (Alice + Bob users/wallets)
npx prisma db seed

# 7. Run the app (local dev, hot reload)
npm run dev

# In a separate terminal — run the notification worker
npm run worker
```

**Run tests:**
```bash
npm test
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Demo login — accepts `{ userId }`, returns a signed JWT (no password) |
| `POST` | `/api/transfer` | Transfer funds between wallets. Requires `Authorization: Bearer <token>` and `Idempotency-Key` header; caller must own the sending wallet |
| `GET` | `/api/wallet/:id/balance` | Fetch a wallet's balance (Redis cache-aside, 10 min TTL) |
| `POST` | `/api/wallet/:id/deposit` | Deposit funds into a wallet. Body: `{ amount }` |

---

## Key Design Decisions

**Why distributed locking?**
Two requests hitting the transfer endpoint for the same wallet at nearly the same instant can both read the same starting balance before either write commits — a classic race condition that enables double-spending. A Redis `SET NX` lock, scoped per wallet ID with a short TTL, ensures only one transfer per wallet processes at a time; the second concurrent request is safely rejected with a 429 rather than silently corrupting the balance.

**Why idempotency keys?**
Networks fail mid-request. If a client's connection drops after the server processes a transfer but before the success response arrives, a naive retry would charge the sender twice. Requiring a unique `Idempotency-Key` per transfer attempt — the same pattern Stripe and Razorpay use — lets the server recognize a retried request and return the original result instead of re-executing the transfer.

**Why optimistic locking on wallet balance (version column)?**
Even inside a single Postgres transaction, the distributed lock and idempotency check happen at the application layer, not the database layer. The `version` column on `Wallet` gives the database itself a final guard: the balance update only commits if the version hasn't changed since it was read, catching any edge case the Redis lock might miss and forcing a clean retry instead of a lost update.