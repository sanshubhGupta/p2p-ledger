# P2P Ledger — Full Code Review

**Project:** p2p-ledger  
**Review date:** July 4, 2026  
**Scope:** Backend (`src/`, Prisma, Docker), Frontend (`frontend/src/`), Integration

---

## Executive Summary

This is a **solid distributed-ledger demo** with real concurrency controls, but it is **not production-ready** yet. The core transfer engine is the strongest part; security, idempotency edge cases, and frontend/backend real-time wiring need the most work.

---

## Architecture Snapshot

| Layer | Stack |
|-------|--------|
| Backend | Express 5, TypeScript, Prisma 7 + PostgreSQL, Redis, BullMQ, Socket.io |
| Frontend | React 19, Vite 8, Socket.io client |
| Infra | Docker Compose (Postgres, Redis, app, worker) |

**Request flow:** `POST /api/transfer` → idempotency → rate limit → distributed lock → atomic Prisma transaction → cache invalidation → WebSocket + BullMQ notification.

The frontend is a single-page dashboard: wallet cards, transfer form, live feed, and a concurrency stress test.

### API Surface

| Method | Path | Middleware |
|--------|------|------------|
| GET | `/health` | none |
| POST | `/api/transfer` | idempotency, rate limit, distributed lock |
| GET | `/api/wallet/:id/balance` | none |
| POST | `/api/wallet/:id/deposit` | none |

### File Reference

| Path | Role |
|------|------|
| `src/index.ts` | Express + Socket.io bootstrap |
| `src/services/TransactionService.ts` | Atomic P2P transfer + optimistic lock |
| `src/services/WalletService.ts` | Balance cache, deposit |
| `src/controllers/transferController.ts` | Transfer HTTP handler |
| `src/middleware/idempotency.ts` | Idempotency-Key dedup |
| `src/middleware/distributedLock.ts` | Per-sender Redis lock |
| `src/middleware/rateLimiter.ts` | Redis counter rate limit |
| `prisma/schema.prisma` | User/Wallet/Transaction models |
| `docker-compose.yml` | Full stack orchestration |
| `frontend/src/App.jsx` | Root state, wallet cards |
| `frontend/src/api.js` | REST API |
| `frontend/src/LiveFeed.jsx` | Socket.io feed |
| `frontend/src/StressTest.jsx` | Concurrency demo |

---

## What's Done Well

### Backend

1. **Atomic transfer core** — `TransactionService.executeTransfer` uses a single Prisma `$transaction` with sender optimistic locking (`version` in `WHERE`). That is the right pattern for preventing double-spend under concurrency.

2. **Money as `Decimal(18,2)`** — No floating-point bugs; amounts stay as `Prisma.Decimal` end-to-end.

3. **Layered concurrency defense** — Optimistic lock + per-sender Redis lock + idempotency keys show good distributed-systems thinking.

4. **Immutable ledger** — Every successful transfer creates a `Transaction` row with useful indexes on sender/receiver and `createdAt`.

5. **Read-through cache** — Balance reads use Redis with explicit invalidation after writes.

6. **Middleware ordering** — Idempotency → rate limit → lock → handler in `transferRoutes.ts` is sensible.

7. **Async notifications** — BullMQ worker with retries/backoff is production-minded.

8. **Security basics** — Helmet enabled, env validation at startup.

9. **Docker Compose topology** — Separate app and worker services, healthchecks on Postgres/Redis, named volume for PG data.

10. **Clear service documentation** — `TransactionService.ts` header comment explains steps, throws, and design rationale thoroughly.

### Frontend

1. **Clean component split** — `App`, `TransferForm`, `LiveFeed`, `StressTest` each have a clear role.

2. **Resilient balance loading** — `Promise.allSettled` so one failed wallet doesn't block the other.

3. **Client-side validation** — Same-wallet transfer and positive amount checks before hitting the API.

4. **Idempotency keys** — Both normal transfers and stress test send `Idempotency-Key` headers correctly.

5. **Stress test design** — Verifies final balance from the API, not just request counts.

6. **Polished UI** — Cohesive dark ledger aesthetic, tabular nums, focus styles, responsive breakpoint at 560px.

7. **Form accessibility basics** — Proper `<label htmlFor="...">` pairing with `<select>` and `<input>` in `TransferForm.jsx`.

8. **Minimal dependency footprint** — Only React, React DOM, and socket.io-client.

---

## Critical Issues (Fix Before Any Real Use)

### 1. No Authentication — Open Financial API

There is no auth middleware. Anyone who knows a wallet UUID can transfer or deposit.

- `JWT_SECRET` is required in `env.ts` but **never used**
- `POST /api/wallet/:id/deposit` is fully open — unlimited money creation
- Transfer accepts arbitrary `senderWalletId` / `receiverWalletId` from the body

**Verdict:** Fine for a local demo; unacceptable for anything beyond that.

**Location:** `src/controllers/transferController.ts`, `src/controllers/walletController.ts`, `src/config/env.ts`

---

### 2. Idempotency Has Race Conditions and Wrong Duplicate Behavior

**File:** `src/middleware/idempotency.ts`

Two concurrent requests with the same `Idempotency-Key` can both pass the Redis cache check before either caches the result → **double transfer**.

On DB unique constraint hit, handler returns **400** instead of the original **200** response:

```
// src/controllers/transferController.ts (lines 74-79)
res.status(400).json({ error: 'Duplicate request: this idempotency key was already used' });
```

A duplicate in-flight request may get **429** from the distributed lock instead of the cached idempotent response.

**Fix:** Use Redis `SET key NX` as an in-flight lock; on duplicate DB constraint, fetch and return the existing transaction with 200.

---

### 3. WebSocket Balance Updates Are Broken (walletId vs userId Mismatch)

Sockets register by `userId` (`src/socket/index.ts`), but transfer handler passes **wallet IDs** (`src/controllers/transferController.ts`):

```
NotificationService.emitBalanceUpdate(io, senderWalletId, 'updated');
NotificationService.emitBalanceUpdate(io, receiverWalletId, 'updated');
```

`emitBalanceUpdate` looks up `userSocketMap.get(userId)` — lookups always miss unless the client connects with a wallet UUID as `userId`. The frontend never connects with `userId` at all, and ignores `balance_updated` anyway.

**Result:** Real-time balance push is effectively dead; only the broadcast `transaction_completed` feed works.

---

### 4. Rate Limiter Never Applies to Transfers

**File:** `src/middleware/rateLimiter.ts`

Transfer body has no `userId`, so the 5 req/min limit **never runs** on the main financial endpoint. The comment in the file even warns about this.

---

### 5. Source Code Exposed in Production

**File:** `src/index.ts` (line 13)

```
app.use(express.static('src'));
```

This serves TypeScript source, test HTML, and generated Prisma client at `/` in Docker.

**Fix:** Remove in production; serve frontend separately.

---

### 6. Docker: No Auto-Migrations

The Dockerfile runs `prisma generate` + `build` but never `prisma migrate deploy`. Fresh `docker-compose up` fails unless migrations are run manually.

---

### 7. Frontend: Hardcoded `localhost:3000`

API and socket URLs are duplicated in three places:

- `frontend/src/api.js`
- `frontend/src/LiveFeed.jsx`
- `frontend/src/StressTest.jsx`

Any non-local deployment breaks without code changes. No `VITE_*` env vars or dev proxy.

---

## Medium Issues

### Backend

| Issue | Detail |
|-------|--------|
| Missing wallet → 500 | `findUniqueOrThrow` on invalid wallet IDs returns 500, not 404 (unlike balance handler) |
| No self-transfer guard | `senderWalletId === receiverWalletId` allowed |
| No UUID validation | Invalid IDs hit DB before being rejected cleanly |
| Circular import | `transferController` imports `{ io } from '../index'` — fragile for testing |
| Hardcoded notification emails | `'sender@example.com'` / `'receiver@example.com'` — never reaches real users |
| Unused schema states | `PENDING` / `FAILED` enum values never written; only `SUCCESS` |
| Dead code | `userRoutes` / `createUser` stub not mounted |
| `/health` shallow | Doesn't check Postgres or Redis |
| Graceful shutdown incomplete | No `prisma.$disconnect()` or `redis.quit()` |
| Cache staleness window | Read between DB commit and cache invalidation can briefly repopulate stale balance |
| Leftover dev comment | `// throw new Error('test rollback');` in `TransactionService.ts` line 79 |
| CORS wide open | `cors()` defaults + Socket.io `origin: '*'` |
| Hardcoded Docker credentials | `admin/secret`, placeholder JWT in compose |
| BullMQ Redis connection | Parses only hostname/port from `REDIS_URL` — password-protected URLs won't work |
| Seed config inconsistency | `package.json` uses `ts-node`, `prisma.config.ts` uses `tsx` |

### Frontend

| Issue | Detail |
|-------|--------|
| Live feed doesn't refresh balances | Socket events update feed but `App.jsx` never refreshes wallet cards |
| Balance refresh race | Overlapping `loadBalances()` calls can finish out of order → stale UI |
| `StressTest` duplicates API layer | Inline fetch instead of reusing `api.js` |
| `parseFloat` for money | JS floats are risky for a ledger; use decimal strings |
| `onTransferComplete()` not awaited | Success message can appear before balances load |
| Non-JSON error responses | `res.json()` on 502/504 HTML throws unclear errors |
| Accessibility gaps | Generic page title (`"frontend"`), no `aria-live` on status messages |
| Dead files | `App.css`, unused SVG assets, default Vite README |
| No error boundary | Uncaught render error crashes entire app |
| No automated tests | Backend or frontend |
| Socket error UX | No `connect_error` or reconnect feedback |
| React StrictMode double-mount | Dev-only socket connect/disconnect churn in `LiveFeed` |

---

## Integration Gaps (Frontend ↔ Backend)

| Feature | Status |
|---------|--------|
| REST transfer + balance | Works |
| `transaction_completed` live feed | Works |
| `balance_updated` WebSocket | Broken (walletId vs userId mismatch) |
| Transfer rate limit | Not applied |
| Strict idempotency on retry | Broken (race + wrong status code) |
| Real-time balance sync in UI | Not wired |

The live feed and REST API are wired correctly. Real-time balance sync and targeted notifications are not.

---

## Recommended Priority Roadmap

### P0 — Must Fix for Anything Beyond Demo

1. Add auth (JWT/session) and bind wallet operations to authenticated users
2. Lock down or remove open `deposit` endpoint
3. Fix idempotency (in-flight lock + return cached 200 on duplicate)
4. Fix WebSocket identity mapping (wallet → user, or register by walletId consistently)
5. Remove `express.static('src')` in production
6. Add `prisma migrate deploy` to Docker entrypoint

### P1 — Production Hardening

7. Rate limit by `senderWalletId` (or verified user from JWT)
8. Central error handler (Prisma P2025 → 404, structured error codes)
9. Input validation (Zod): UUID format, positive decimals, no self-transfer
10. Frontend env config (`VITE_API_URL`) + wire socket events to balance refresh
11. Deep `/health` checks (DB + Redis)
12. Graceful shutdown (Prisma, Redis, BullMQ)

### P2 — Quality & Maintainability

13. Automated tests (unit: `TransactionService`; integration: concurrent transfers, balance conservation)
14. TypeScript on frontend
15. Unify HTTP layer (`StressTest` → `api.js`)
16. Fix refresh races (`AbortController` or request sequencing)
17. Use transaction lifecycle (`PENDING → SUCCESS/FAILED`) for audit trail
18. Resolve real user emails for notifications
19. Remove dead files (`App.css`, unused assets)
20. Add React error boundary

---

## Overall Verdict

| Area | Grade | Summary |
|------|-------|---------|
| **Core ledger logic** | A | Atomic transfers, optimistic locking, decimal money — well designed |
| **Distributed systems** | B- | Good ideas (Redis lock, idempotency, cache) but edge cases not fully handled |
| **Security** | D | No auth, open deposit, exposed source, ineffective rate limit |
| **Real-time** | C | Live feed works; targeted balance push broken |
| **Frontend UX** | B | Clean demo UI; stale balances, hardcoded URLs, missing real-time sync |
| **DevOps** | C+ | Good compose topology; missing migrations, shallow health |
| **Tests** | F | No automated tests |

---

## Bottom Line

This is a **strong learning/portfolio project** with a genuinely good transfer engine. The distributed-ledger concepts (ACID, optimistic locking, idempotency, caching, job queue) are implemented thoughtfully.

To move toward production, focus on:

1. **Authentication / authorization**
2. **Idempotency correctness**
3. **WebSocket identity fix**
4. **Frontend/backend real-time balance sync**

Those are the highest-impact gaps.

---

*Generated from full codebase review — backend, frontend, and integration analysis.*
