# Triage Report: GM Bank App Full Analysis

**Date:** 2026-04-25  
**Branch:** gsd/bugfix/analyze-app-write-plan-for-improving-bug  
**Scope:** Backend, Mobile (React Native/Expo), Admin Panel

---

## Summary

Full-stack analysis identified **68 issues** across three apps:

| Severity | Backend | Mobile | Admin | Total |
|----------|---------|--------|-------|-------|
| CRITICAL | 3 | 2 | 3 | **8** |
| HIGH | 5 | 4 | 3 | **12** |
| MEDIUM | 8 | 5 | 5 | **18** |
| LOW | 9 | 4 | 4 | **17** |
| Optimization | 3 | 2 | 8 | **13** |

---

## CRITICAL Issues (Fix Immediately)

### Backend

**B-C1. CORS allows all origins with credentials**  
- `backend/src/index.js:27` — `origin: true` + `credentials: true` enables CSRF  
- Fix: Whitelist origins via `ALLOWED_ORIGINS` env var

**B-C2. JWT fallback secret in WebSocket auth**  
- `backend/src/websocket/index.js:22` — Falls back to `'fallback_secret'` if `JWT_SECRET` unset  
- Fix: Throw error if `JWT_SECRET` missing

**B-C3. Redis connection failure silently ignored**  
- `backend/src/cache/index.js:10-13` — App boots without cache; stale data served inconsistently  
- Fix: Make connection blocking or implement proper fallback strategy

### Mobile

**M-C1. Silent error swallowing in all data loading**  
- `mobile/stores/useStore.ts:197-241` — All `load*()` methods have empty `catch {}` blocks  
- Fix: Add error state to store, display user-facing errors

**M-C2. Auth token race condition**  
- `mobile/stores/useStore.ts:100-160` + `mobile/services/api.ts:137-168`  
- Tokens saved in two places (store + api.ts) without sync guarantees  
- Fix: Single source of truth for token management

### Admin

**A-C1. Hardcoded admin credentials in UI**  
- `admin/src/App.jsx:56,113` — Default `+79000000000 / 0000` visible in source and UI hints  
- Fix: Remove from source, use env vars for dev only

**A-C2. Global mutable TOKEN variable**  
- `admin/src/App.jsx:4` — Module-scope `let TOKEN` outside React state  
- Fix: Move to React state/context

**A-C3. XSS in error message rendering**  
- `admin/src/App.jsx:49,103` — API error strings rendered directly in JSX  
- Fix: Sanitize and length-limit error messages

---

## HIGH Issues

### Backend

| ID | File:Line | Issue |
|----|-----------|-------|
| B-H1 | `routes/limits.js:28-29` | No validation for negative spending limits |
| B-H2 | `routes/decks.js:78-110` | Deck cards deleted before validation — corruption on failure |
| B-H3 | `middleware/auth.js:20-25` | Admin status from JWT, not re-checked from DB |
| B-H4 | `routes/users.js:95-117` | User search leaks phone numbers (3-char minimum) |
| B-H5 | `routes/transactions.js` | No DB constraint preventing negative balances |

### Mobile

| ID | File:Line | Issue |
|----|-----------|-------|
| M-H1 | `app/index.tsx:26-29` | `loadAll()` not awaited — screens flash empty then fill |
| M-H2 | `app/register.tsx:49-50` | Card number Luhn checksum not validated (UI claims it is) |
| M-H3 | `app/login.tsx:37-46` | PIN auto-submit + button = double login race condition |
| M-H4 | `services/api.ts:137-168` | Token save happens after response return — crash loses token |

### Admin

| ID | File:Line | Issue |
|----|-----------|-------|
| A-H1 | `App.jsx:125,208,307,397,545` | Silent `.catch(() => {})` on all API calls |
| A-H2 | `App.jsx:216,226,317,434` | `alert()` for errors — poor UX, exposes raw messages |
| A-H3 | `App.jsx:37-46` | No CSRF protection on state-changing requests |

---

## MEDIUM Issues

### Backend

| ID | File | Issue |
|----|------|-------|
| B-M1 | `routes/auth.js:58-90` | No rate limiting on login/register |
| B-M2 | `routes/auth.js:73-76` | No expiration tracking for refresh tokens |
| B-M3 | `routes/auth.js:96-98` | Name fields not length-validated |
| B-M4 | `prisma/schema.prisma` | Missing indexes on Transaction, Notification, UserCard |
| B-M5 | `websocket/index.js:16-28` | WebSocket auth differs from HTTP auth token path |
| B-M6 | `routes/cards.js:116` | Card source enum inconsistency |
| B-M7 | `services/cardEngine.js:314-327` | No maxHealth validation on sacrifice |
| B-M8 | `routes/transactions.js:278` | Notification creation errors silently swallowed |

### Mobile

| ID | File:Line | Issue |
|----|-----------|-------|
| M-M1 | `app/payment.tsx:107-125` | Payment error handling conflates payment vs reload errors |
| M-M2 | `app/(tabs)/_layout.tsx:28-37` | Interval may leak if callback deps unstable |
| M-M3 | `app/transfer.tsx:145-149` | Recipient field not cleared on method switch |
| M-M4 | `app/login.tsx:81` | Phone input has no maxLength |
| M-M5 | `app/index.tsx:17-38` | No error boundary on bootstrap |

### Admin

| ID | File:Line | Issue |
|----|-----------|-------|
| A-M1 | `App.jsx:287-289,362-375` | No client-side form validation |
| A-M2 | `App.jsx:213,222,313` | No loading/disabled state on mutation buttons |
| A-M3 | `App.jsx:268,372-373` | Type coercion bugs in number inputs |
| A-M4 | `App.jsx:129-141` | No loading skeletons for tables |
| A-M5 | `App.jsx:532` | Theme init passes function ref instead of calling it |

---

## LOW Issues (Selected)

| ID | Area | Issue |
|----|------|-------|
| B-L1 | `auth.js:64-65` | Different error msgs for "not found" vs "wrong PIN" = enumeration |
| B-L2 | `index.js:30` | No request body size limit |
| B-L3 | `cardEngine.js:160-163` | Overly broad try-catch in health decay |
| M-L1 | `login.tsx:14` | Hardcoded test phone number |
| M-L2 | Multiple | Missing accessibility labels |
| M-L3 | `api.ts:74` | Hardcoded fallback API IP `192.168.1.100` |
| A-L1 | `App.jsx:604-608` | No logout confirmation |
| A-L2 | `index.html` | No Content-Security-Policy headers |

---

## Proposed Fix Plan

### Phase 1 — Critical Security + Rate Limiting (this PR)
1. ~~Fix CORS configuration (backend)~~ ✅
2. ~~Remove JWT fallback secret (backend)~~ ✅
3. ~~Handle Redis connection properly (backend)~~ ✅
4. ~~Add rate limiting to auth endpoints (backend)~~ ✅ — login 10/15m, register 5/1h, refresh 30/15m
5. ~~Remove hardcoded admin credentials (admin)~~ ✅
6. ~~Fix global TOKEN variable (admin)~~ ✅
7. ~~Sanitize error message rendering (admin)~~ ✅
8. ~~Add error states to mobile data loading~~ ✅
9. ~~Fix auth token single source of truth (mobile)~~ ✅

### Phase 2 — High Priority (follow-up)
10. Add input validation (negative limits, Luhn check)
11. Fix deck update transaction ordering
12. Re-check admin status from DB
13. Fix race conditions (PIN double-submit, loadAll await)
14. Replace remaining silent catch blocks with proper error handling

### Phase 3 — Medium/Optimization (backlog)
15. Add database indexes
16. Add refresh token expiration
17. Form validation across admin panel
18. Loading states and UX improvements
19. Performance optimizations (memoization, virtualization)
20. Add request body size limit to Express

---

## Affected Files

**Backend:** `src/index.js`, `src/websocket/index.js`, `src/cache/index.js`, `src/routes/auth.js`, `src/routes/limits.js`, `src/routes/decks.js`, `src/routes/users.js`, `src/routes/transactions.js`, `src/routes/cards.js`, `src/middleware/auth.js`, `src/services/cardEngine.js`, `prisma/schema.prisma`

**Mobile:** `stores/useStore.ts`, `services/api.ts`, `app/index.tsx`, `app/login.tsx`, `app/register.tsx`, `app/payment.tsx`, `app/transfer.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`

**Admin:** `src/App.jsx`, `index.html`
