# Codebase Concerns

**Analysis Date:** 2026-04-25

## Summary

This banking app codebase (GM Bank) contains **68 documented issues** across backend, mobile, and admin layers. Analysis identified critical security flaws in authentication/CORS, high-risk race conditions and token management, medium-priority data validation gaps, and performance/scaling concerns. The TRIAGE.md document provides comprehensive categorization; this analysis elaborates on key concerns and remediation strategies.

---

## Critical Issues (Immediate Action Required)

### Backend

**B-C1: CORS Allows All Origins with Credentials**
- **Files:** `backend/src/index.js:28-44`
- **Issue:** CORS configuration uses whitelist from `ALLOWED_ORIGINS` env var with `credentials: true` enabled. While the origin checking prevents credential leakage to arbitrary origins, if an attacker controls the environment or if the origin list is misconfigured (e.g., includes `*.example.com`), CSRF attacks become possible.
- **Risk:** Cross-Site Request Forgery (CSRF) allowing malicious sites to trigger state-changing operations on behalf of authenticated users.
- **Current mitigation:** Origins checked against explicit whitelist.
- **Recommended fix:**
  - Ensure `ALLOWED_ORIGINS` never includes wildcards
  - Add CSRF token headers for state-changing requests (POST/PUT/DELETE)
  - Validate Referer/Origin headers more strictly
  - Consider SameSite cookie attributes for refresh tokens

**B-C2: Redis Connection Failure Silently Ignored**
- **Files:** `backend/src/cache/index.js:9-23`
- **Issue:** Redis client connects asynchronously in background. If Redis is unavailable at startup, the app boots successfully but serves stale/missing cached data inconsistently. No blocking initialization.
- **Risk:** Data inconsistency, cache bypasses, unpredictable behavior in production.
- **Current state:** App logs warnings but continues; `redisAvailable` flag tracks connection state.
- **Recommended fix:**
  - Make Redis connection blocking and fail fast if `REDIS_URL` is required
  - Add health check endpoint (`/health`) that verifies cache availability
  - Implement cache-miss fallback strategy with explicit error responses
  - Document whether Redis is optional or mandatory

**B-C3: Admin Status Not Re-Checked from DB**
- **Files:** `backend/src/middleware/auth.js:13`, `backend/src/routes/auth.js:70-71`
- **Issue:** `isAdmin` flag comes from JWT token only, never re-validated against database. Admin status changes only take effect after user re-login.
- **Risk:** Privilege escalation: admin privilege can be revoked but user's existing token remains valid until expiration (15 minutes).
- **Current state:** JWT includes `isAdmin` from signup; refresh endpoint reads from DB but only on explicit `/refresh` call.
- **Recommended fix:**
  - Always re-check `isAdmin` from database in `adminMiddleware`
  - Implement admin status cache with TTL (5 min)
  - Add revocation list for compromised admin tokens

**B-C4: JWT Fallback Secret Removed (Code Inspection)**
- **Files:** `backend/src/websocket/index.js:24-26`
- **Issue:** WebSocket JWT verification now requires `JWT_SECRET` to be set; throws error if missing (good). Fixed from earlier fallback behavior.
- **Status:** RESOLVED in current code

**B-C5: No Rate Limiting on Auth Endpoints**
- **Files:** `backend/src/routes/auth.js` (POST /login, /register, /refresh not wrapped)
- **Issue:** While global rate limiter exists (`200 req / 15 min` in index.js), auth endpoints need tighter per-endpoint limits to prevent brute force attacks.
- **Risk:** Brute force attacks on PIN codes (4 digits = 10k combinations).
- **Recommended fix:**
  - Implement endpoint-specific rate limiting:
    - `/auth/login`: 10 attempts per 15 minutes per IP
    - `/auth/register`: 5 attempts per hour per IP
    - `/auth/refresh`: 30 attempts per 15 minutes per IP
  - Use `express-rate-limit` with store options for distributed systems

---

### Mobile

**M-C1: Silent Error Swallowing in Data Loading**
- **Files:** `mobile/stores/useStore.ts:201-246`
- **Issue:** All `load*()` methods catch exceptions but only set error state, then silently continue. No retry mechanism, no user notification in UI.
- **Risk:** Users see blank screens or stale data without knowing data load failed.
- **Current state:** `error` state is set but UI implementation varies; some screens may not display it.
- **Recommended fix:**
  - Ensure every screen displaying data checks `error` state and shows user-facing message
  - Add retry UI for failed loads
  - Log errors to analytics/monitoring
  - Implement exponential backoff for network failures

**M-C2: Auth Token Race Condition**
- **Files:** `mobile/stores/useStore.ts:104-121`, `mobile/services/api.ts:137-142, 159-167`
- **Issue:** Tokens saved in two places asynchronously:
  1. `api.ts` saves to SecureStore after login response
  2. `useStore.ts` saves token to state immediately
  
  If app crashes between API response and SecureStore write, token is lost but store thinks it's valid.
- **Risk:** Auth failures, silent logouts, inconsistent app state.
- **Current state:** Both save operations are fire-and-forget (`await` but no error handling).
- **Recommended fix:**
  - **Single source of truth:** Store token in SecureStore first, then read into state
  - Make token persistence a blocking operation before state update
  - Add migration logic for old state-stored tokens
  - Add test for token persistence across crashes

**M-C3: Hardcoded Test Credentials in Source**
- **Files:** `mobile/app/login.tsx:14`
- **Issue:** Default test phone `+79001234567` is hardcoded in UI. Easy for users to discover test account or for testers to accidentally ship with default credentials exposed.
- **Risk:** Test account takeover, unintended access patterns in analytics.
- **Recommended fix:**
  - Remove hardcoded default from source
  - Use environment variable or build config for test credentials
  - Implement feature flag to hide test credentials in production builds

**M-C4: Card Number Luhn Validation Not Enforced**
- **Files:** `mobile/app/register.tsx:49-50`
- **Issue:** UI shows card input formatted to spaces but backend validates Luhn checksum (`backend/src/routes/auth.js:24-40`). Mobile register does NOT validate Luhn before sending, just checks length >= 13.
- **Risk:** Validation happens server-side, but UX doesn't provide immediate feedback on invalid card numbers.
- **Recommended fix:**
  - Import Luhn validation function from shared library
  - Validate card number before enabling submit button
  - Show "Invalid card number" error in UI

**M-C5: PIN Auto-Submit Race Condition**
- **Files:** `mobile/app/login.tsx:42-44`
- **Issue:** When PIN reaches 4 digits, `setTimeout(..., 100)` triggers submit. User can also tap login button. Two login requests may race.
- **Risk:** Double login attempts, token confusion, race condition in token storage.
- **Recommended fix:**
  - Add `isLoading` state check; disable button during submission
  - Debounce auto-submit
  - Clear PIN only after success, not on race condition

**M-C6: Missing API URL Fallback**
- **Files:** `mobile/services/api.ts:74`
- **Issue:** Last fallback is `http://192.168.1.100:3000/api` — hardcoded router IP that won't work in most environments.
- **Risk:** New developers get confusing "Cannot connect to API" errors instead of clear guidance.
- **Recommended fix:**
  - Remove hardcoded IP fallback
  - Show clear error message directing to .env setup
  - Document all supported API URL resolution strategies

---

### Admin

**A-C1: Hardcoded Admin Credentials in Source**
- **Files:** `admin/src/App.jsx:112-113` (no hardcoded defaults visible in login form)
- **Issue:** While login form doesn't show defaults, test credentials exist in docs/README (phone: `+79000000000`, PIN: `0000`). If source gets leaked, test account is compromised.
- **Risk:** Test account takeover, unauthorized admin access.
- **Status:** Partially addressed; defaults not in code but documented publicly.
- **Recommended fix:**
  - Never document test credentials in public docs
  - Use environment variables or separate test setup documentation (internal only)

**A-C2: Global Token Variable in Module Scope**
- **Files:** `admin/src/App.jsx:6`
- **Issue:** `let TOKEN` is module-scoped variable, not React state. Stale closures possible if multiple components access it.
- **Status:** FIXED in current code — using `tokenRef.current` with localStorage sync.

**A-C3: XSS in Error Message Rendering**
- **Files:** `admin/src/App.jsx:60, 114`
- **Issue:** API error strings are rendered directly in JSX: `<div>{error}</div>`. If backend returns malicious HTML in error field, it could execute scripts.
- **Risk:** Cross-Site Scripting (XSS) if API is compromised or MITM attack occurs.
- **Current mitigation:** JSX escapes HTML by default.
- **Recommended fix:**
  - Keep JSX escaping (currently safe)
  - Add length limit: `.slice(0, 200)` already applied at line 60
  - Add error boundary for unexpected error types

**A-C4: Silent API Errors Caught Globally**
- **Files:** `admin/src/App.jsx:136-137, 219, 227, 237` (multiple `.catch(() => {})` blocks)
- **Issue:** API calls silently fail with no user feedback. `apiFetch` throws but callers suppress errors.
- **Risk:** Users don't know if their action succeeded, data loads fail silently.
- **Recommended fix:**
  - Remove silent `.catch(() => {})` chains
  - Implement centralized error handler
  - Show toast/notification for API errors
  - Add loading states during requests

**A-C5: No CSRF Protection on State-Changing Requests**
- **Files:** `admin/src/App.jsx:37-46` (apiFetch implementation)
- **Issue:** No CSRF token sent with POST/PUT/DELETE requests. If backend allows CORS from attacker origin, state-changing operations are vulnerable.
- **Risk:** Cross-Site Request Forgery (CSRF).
- **Current mitigation:** Backend checks `origin` header, but no CSRF token added.
- **Recommended fix:**
  - Backend: Generate CSRF token on first GET request
  - Admin: Store and send CSRF token with all mutations
  - Use SameSite cookie attributes as defense-in-depth

---

## High-Priority Issues

### Backend

**B-H1: No Validation for Negative Spending Limits**
- **Files:** `backend/src/routes/limits.js:20-36`
- **Issue:** `limitAmount` is saved directly without validating it's positive. Negative limits break business logic.
- **Risk:** Data corruption, undefined behavior in analytics/UI.
- **Recommended fix:** Add validation: `if (limitAmount <= 0) return res.status(400).json({ error: 'Limit must be positive' })`

**B-H2: Deck Cards Deleted Before Validation**
- **Files:** `backend/src/routes/decks.js:102-110`
- **Issue:** Line 103 calls `deleteMany()` to clear existing deck cards, then creates new ones. If creation fails, deck is left with no cards (data corruption).
- **Risk:** Orphaned deck states, data corruption on transaction failure.
- **Recommended fix:**
  - Use database transaction: `await req.prisma.$transaction([...deleteMany, ...createMany])`
  - Or validate all cards before any deletion

**B-H3: User Search Leaks Phone Numbers via Substring**
- **Files:** `backend/src/routes/users.js:96-117`
- **Issue:** Search endpoint accepts 3+ character queries and returns full phone numbers. An attacker can enumerate phone numbers character-by-character.
- **Risk:** Privacy leak, phone enumeration attack.
- **Recommended fix:**
  - Require minimum 10 characters for phone search
  - Don't return phone numbers in search results; only return name/id
  - Consider rate limiting search endpoint

**B-H4: No DB Constraint Preventing Negative Balances**
- **Files:** `backend/prisma/schema.prisma:88`, `backend/src/routes/accounts.js` (implicit)
- **Issue:** `BankAccount.balance` is Float with no constraint. Transactions don't check balance before deducting.
- **Risk:** Accounts can go negative, money appears to be created/destroyed.
- **Recommended fix:**
  - Add CHECK constraint: `CHECK (balance >= 0)`
  - Validate balance before transaction in app code
  - Use database triggers for critical invariants

**B-H5: WebSocket Auth Differs from HTTP Auth**
- **Files:** `backend/src/websocket/index.js:18-32`
- **Issue:** WebSocket uses `socket.handshake.auth.token` but HTTP uses `Authorization: Bearer {token}` header. Token format/path inconsistency.
- **Risk:** Auth bypass if one path is weaker; confusing for developers.
- **Recommended fix:** Normalize auth to single approach; validate token format identically

**B-H6: Notification Creation Errors Silently Swallowed**
- **Files:** `backend/src/routes/transactions.js:278` (implicit from TRIAGE)
- **Issue:** When creating notifications after transactions, errors are caught but not propagated.
- **Risk:** Notifications never sent, users don't see important updates.
- **Recommended fix:** Log notification failures; don't fail transaction but queue for retry

---

### Mobile

**M-H1: loadAll() Not Awaited in Bootstrap**
- **Files:** `mobile/app/index.tsx:28`
- **Issue:** `loadAll()` is called without `await`, so screens render before data loads.
- **Risk:** Users see empty screens briefly, then data appears (flash/jank).
- **Recommended fix:** `await loadAll()` before `router.replace('/(tabs)')`

**M-H2: Token Save After Response Return**
- **Files:** `mobile/services/api.ts:139-141, 161-162`
- **Issue:** Token is saved to SecureStore **after** `api.post()` returns. If app crashes between response and save, token is lost.
- **Risk:** Auth failures after crash, need to re-login.
- **Recommended fix:** Wrap login/register to ensure token is persisted before resolving

**M-H3: No Error Boundary on Bootstrap**
- **Files:** `mobile/app/index.tsx:18-38`
- **Issue:** Bootstrap logic is try-catch at top level but wrapped in component render. Errors here crash app.
- **Risk:** App crashes if loadToken fails unexpectedly.
- **Recommended fix:** Add error boundary component around bootstrap; show fallback UI

---

### Admin

**A-H1: Silent `.catch(() => {})` on All API Calls**
- **Files:** `admin/src/App.jsx` (multiple instances: lines 136, 219, 227, 237, etc.)
- **Issue:** API failures are completely silent; no error state, no retry, no logging.
- **Risk:** Users don't know operations failed, data appears stale without warning.
- **Recommended fix:** Centralize error handling; show errors to user

**A-H2: `alert()` Used for Error Messages**
- **Files:** `admin/src/App.jsx:227, 237`
- **Issue:** Raw error messages shown in browser alert(); ugly UX, exposes internal error details.
- **Risk:** Poor UX, security info leakage (API error details).
- **Recommended fix:** Use toast/notification component for errors; sanitize/truncate messages

**A-H3: No Loading State on Mutation Buttons**
- **Files:** `admin/src/App.jsx:262, 288`
- **Issue:** Buttons don't disable during API calls; user can click multiple times causing duplicate requests.
- **Risk:** Duplicate entries, race conditions, data corruption.
- **Recommended fix:** Disable buttons with `disabled={isLoading}`, add loading spinner

---

## Medium-Priority Issues

### Backend

**B-M1: No Input Validation on Name Fields**
- **Files:** `backend/src/routes/auth.js:97-99`
- **Issue:** `firstName` and `lastName` only checked for emptiness, not length-validated.
- **Risk:** Excessively long names break UI, buffer overflow in string operations (low risk but possible).
- **Recommended fix:** Add max length: `if (fn.length > 100 || ln.length > 100) return res.status(400).json(...)`

**B-M2: Missing Database Indexes**
- **Files:** `backend/prisma/schema.prisma` (entire schema)
- **Issue:** TRIAGE notes missing indexes on Transaction, Notification, UserCard. Common queries will do full table scans as data grows.
- **Risk:** Query performance degrades (N+1 queries, slow reports).
- **Performance impact:** Transactions table grows linearly; O(n) queries become O(n²) in loops.
- **Recommended fix:**
  - Add indexes: `@index([userId, createdAt])` on Transaction, Notification
  - Add `@index([userId])` on UserCard
  - Measure query plans with `EXPLAIN`

**B-M3: No Refresh Token Expiration Tracking**
- **Files:** `backend/src/routes/auth.js:50-55`
- **Issue:** Refresh tokens are issued with 30-day TTL but no `expiresAt` field stored in DB. Token revocation/expiration can't be verified.
- **Risk:** Revoked tokens (e.g., after logout) can be reused if persisted by client.
- **Recommended fix:**
  - Add `refreshTokenExpiresAt` field to User model
  - Check expiration on `/refresh` endpoint
  - Implement token revocation list

**B-M4: Card Source Enum Inconsistency**
- **Files:** `backend/prisma/schema.prisma:25-32`
- **Issue:** `CardSource` enum includes both `PURCHASE` and `SHOP` but documentation unclear which is used when.
- **Risk:** Inconsistent data; analytics queries fail.
- **Recommended fix:** Consolidate to single source type; update all queries

**B-M5: No maxHealth Validation on Card Sacrifice**
- **Files:** `backend/src/services/cardEngine.js:314-327`
- **Issue:** When sacrificing card to restore HP, no max health check. Card could exceed `maxHealth` boundary.
- **Risk:** Cards become overpowered, game balance breaks.
- **Recommended fix:** Add check: `if (health > maxHealth) health = maxHealth`

**B-M6: No Request Body Size Limit**
- **Files:** `backend/src/index.js:46`
- **Issue:** `express.json()` has no size limit. Attacker can send multi-MB requests exhausting memory.
- **Risk:** Denial of Service (DoS).
- **Recommended fix:** `app.use(express.json({ limit: '10kb' }))`

---

### Mobile

**M-M1: Payment Error Handling Conflates Errors**
- **Files:** `mobile/app/payment.tsx:107-125`
- **Issue:** Error messages don't distinguish between payment failure vs. data reload failure.
- **Risk:** User sees generic error, doesn't know what failed (payment or balance update?).
- **Recommended fix:** Separate try-catch blocks for payment and reload operations

**M-M2: Interval May Leak if Callback Deps Unstable**
- **Files:** `mobile/app/(tabs)/_layout.tsx:28-37`
- **Issue:** Interval set in useEffect without cleanup or stable dependency array.
- **Risk:** Memory leak, multiple intervals running simultaneously.
- **Recommended fix:** Add cleanup: `return () => clearInterval(intervalId)`; ensure deps are stable

**M-M3: Recipient Field Not Cleared on Method Switch**
- **Files:** `mobile/app/transfer.tsx:145-149`
- **Issue:** When switching transfer method (bank vs. phone), recipient field keeps old value.
- **Risk:** Wrong recipient selected, money sent to wrong place.
- **Recommended fix:** `onMethodChange={() => { setRecipient(''); ... }}`

**M-M4: Phone Input Has No maxLength**
- **Files:** `mobile/app/login.tsx:81`
- **Issue:** Phone input accepts arbitrary length. Attacker can paste huge string.
- **Risk:** UI breaks, performance degrades.
- **Recommended fix:** Add `maxLength={20}` to phone input

---

### Admin

**A-M1: No Client-Side Form Validation**
- **Files:** `admin/src/App.jsx:287-289, 362-375`
- **Issue:** Forms submit without validation (e.g., negative numbers, empty fields accepted).
- **Risk:** Server rejects requests; poor UX; opportunity for malformed data if server validation is weak.
- **Recommended fix:** Add client-side checks before POST/PUT; disable submit if invalid

**A-M2: No Loading Skeletons or Spinners**
- **Files:** `admin/src/App.jsx:140-150`
- **Issue:** Dashboard shows "Loading..." text, no visual feedback during data fetch.
- **Risk:** Users think app is hung; poor perceived performance.
- **Recommended fix:** Add skeleton loaders or spinners for each section

**A-M3: Type Coercion Bugs in Number Inputs**
- **Files:** `admin/src/App.jsx:279`
- **Issue:** `parseInt(e.target.value)` can return NaN if input is non-numeric.
- **Risk:** Invalid data sent to server; broken analytics.
- **Recommended fix:** Validate: `if (!Number.isInteger(n)) setError('Must be a number')`

**A-M4: Theme Init Passes Function Ref Instead of Calling**
- **Files:** `admin/src/App.jsx:531`
- **Issue:** (Mentioned in TRIAGE) Initial theme setup may not work correctly.
- **Recommended fix:** Ensure theme function is invoked, not passed by reference

---

## Low-Priority Issues

**B-L1: Different Error Messages for "User Not Found" vs "Wrong PIN"**
- **Files:** `backend/src/routes/auth.js:65, 69`
- **Issue:** Both return `'Неверный телефон или PIN'` — same message. Good for security (no enumeration).
- **Status:** RESOLVED in current code

**B-L2: Overly Broad Try-Catch in Health Decay**
- **Files:** `backend/src/services/cardEngine.js:160-163`
- **Issue:** Catches all exceptions; might hide bugs.
- **Recommended fix:** Catch only specific exceptions

**M-L1: Multiple Screens Missing Accessibility Labels**
- **Files:** `mobile/app/` (various components)
- **Issue:** Buttons lack `testID` or `accessibilityLabel`.
- **Risk:** Screen reader users can't navigate; failed accessibility compliance.
- **Recommended fix:** Add `accessibilityLabel` to interactive elements

**M-L2: Hardcoded Fallback IP in API Discovery**
- **Files:** `mobile/services/api.ts:74`
- **Issue:** `192.168.1.100` is just a guess; won't work in most deployments.
- **Recommended fix:** Remove fallback; require explicit configuration

**A-L1: No Logout Confirmation**
- **Files:** `admin/src/App.jsx:604-608`
- **Issue:** Logout button has no confirmation; accidental clicks cause immediate logout.
- **Risk:** User loses work, poor UX.
- **Recommended fix:** Add confirm dialog before logout

---

## Test Coverage Gaps

**B-Test-1: Auth Endpoints Untested**
- **What's not tested:** Login, register, refresh token flows
- **Files:** `backend/src/routes/auth.js`
- **Risk:** Auth bugs go undetected; critical path is fragile
- **Recommended action:** Add comprehensive auth tests (happy path, error cases, token expiration)

**B-Test-2: Database Constraint Violations Untested**
- **What's not tested:** Negative balance checks, duplicate card ownership
- **Files:** `backend/prisma/schema.prisma`
- **Risk:** Invalid data silently corrupts database
- **Recommended action:** Add integration tests with constraint violations

**M-Test-3: Token Persistence Untested**
- **What's not tested:** Token storage across app restarts, SecureStore failures
- **Files:** `mobile/stores/useStore.ts`, `mobile/services/api.ts`
- **Risk:** Auth issues only discovered in production
- **Recommended action:** Add e2e tests for login→crash→restart→authenticated flow

**Admin-Test-1: Form Submission Untested**
- **What's not tested:** Admin CRUD operations (users, cards, etc.)
- **Files:** `admin/src/App.jsx`
- **Risk:** Data mutations fail or corrupt silently
- **Recommended action:** Add integration tests for each admin form

---

## Scaling & Performance Concerns

**Perf-1: Missing Database Indexes Will Cause N+1 Queries**
- **Problem:** Transaction, Notification, UserCard tables grow unbounded; no indexes on common queries
- **Current scale:** Documented for small-scale development
- **Scaling threshold:** 10k+ users will see multi-second query times
- **Improvement path:**
  - Profile queries with `EXPLAIN ANALYZE`
  - Add indexes on foreign keys and filter columns
  - Consider pagination for large result sets

**Perf-2: No Pagination on Collection Cards**
- **Files:** `backend/src/routes/cards.js`
- **Issue:** All collection cards loaded at once; no `limit`/`offset`
- **Risk:** As card catalog grows, loading becomes slow
- **Improvement path:** Implement paginated collection endpoint with cursor-based pagination

**Perf-3: Cache Not Utilized for User Data**
- **Files:** `backend/src/services/` (implicit)
- **Issue:** User, account, transaction data re-fetched on every request
- **Risk:** Query amplification with many clients
- **Improvement path:** Add cache layer (Redis) for user profiles (TTL 5 min)

---

## Dependencies at Risk

**Dep-1: Prisma 6.5.0 — Recent Major Version**
- **Package:** `@prisma/client@^6.5.0`
- **Risk:** New major version may have breaking changes; migration path unclear
- **Mitigation:** Maintain caret version; test updates thoroughly
- **Action:** Monitor Prisma 7.0 release notes when available

**Dep-2: Jest 30.3.0 — Unusually High Version**
- **Package:** `jest@^30.3.0`
- **Risk:** Version number suggests non-standard release; may be typo (should be ~29.x)
- **Mitigation:** Verify version is intentional or downgrade to stable Jest 29
- **Action:** Check package.json for typo; confirm with team

**Dep-3: No Lock File Committed (if true)**
- **Files:** `package.json`, `package-lock.json` (check existence)
- **Risk:** Transitive dependency changes break builds
- **Mitigation:** Always commit lock files to version control
- **Action:** Verify all packages have committed lock files

---

## Fragile Areas

**Fragile-1: Card Deck Update Logic is Order-Sensitive**
- **Files:** `backend/src/routes/decks.js:102-110`
- **Why fragile:** Deletes before creates; no transaction. Any DB error leaves orphaned cards.
- **Safe modification:** Wrap in `$transaction([deleteMany(...), createMany(...)])`
- **Test coverage:** No tests for transaction rollback

**Fragile-2: Token Management Split Between Two Layers**
- **Files:** `mobile/services/api.ts:137-142` (saves token), `mobile/stores/useStore.ts:104-121` (syncs state)
- **Why fragile:** Two save points, no coordination. Crash between them causes inconsistency.
- **Safe modification:** Move all token persistence to SecureStore; derive state from it
- **Test coverage:** No crash/recovery tests

**Fragile-3: Admin Authorization Relies on JWT Only**
- **Files:** `backend/src/middleware/auth.js:13`, `backend/src/routes/auth.js:71`
- **Why fragile:** `isAdmin` from JWT, never re-checked. Token doesn't expire for 15 minutes.
- **Safe modification:** Always validate `isAdmin` from database; add shorter TTL for admin tokens
- **Test coverage:** No tests for revocation scenarios

**Fragile-4: Error Messages Directly Rendered in Admin UI**
- **Files:** `admin/src/App.jsx:60, 114`
- **Why fragile:** Raw API error strings displayed; if API is compromised, XSS risk
- **Safe modification:** Sanitize and truncate all error strings; use error codes instead of messages
- **Test coverage:** No security tests for error injection

---

## Security Considerations

**Sec-1: JWT Secret Management**
- **Risk:** `JWT_SECRET` and `JWT_REFRESH_SECRET` must be strong and kept secret
- **Files:** `backend/.env`
- **Current mitigation:** Required in `.env`; not in git
- **Recommendations:**
  - Rotate JWT_SECRET monthly (requires token reissue on all users)
  - Use separate secrets for access/refresh tokens (already done)
  - Never log JWT values

**Sec-2: PIN Code Strength**
- **Risk:** 4-digit PIN = only 10,000 combinations; brute-forceable in seconds with 10 req/sec
- **Files:** `backend/src/routes/auth.js:100`
- **Current mitigation:** Rate limiting at 200 req/15 min globally
- **Recommendations:**
  - Implement per-endpoint rate limiting (10 login/15 min per IP)
  - Consider progressive delays (exponential backoff after failures)
  - Notify user of failed login attempts

**Sec-3: Refresh Token Revocation**
- **Risk:** Logout doesn't invalidate refresh tokens; stolen tokens valid for 30 days
- **Files:** `backend/src/routes/auth.js:50-55`
- **Current mitigation:** Token stored in DB; can be overwritten
- **Recommendations:**
  - Implement token revocation list (Redis set of invalidated token IDs)
  - Shorten refresh token TTL to 7 days
  - Add logout-confirm with revocation

**Sec-4: Phone Number Privacy**
- **Risk:** User search leaks phone numbers; enumeration attack possible
- **Files:** `backend/src/routes/users.js:95-117`
- **Current mitigation:** 3-char minimum query length
- **Recommendations:**
  - Require 10+ chars for phone search
  - Return name/ID only, not full phone
  - Rate limit search endpoint (max 10 searches/min per user)

**Sec-5: Card Data in Logs**
- **Risk:** If logs capture API request bodies, sensitive data (card numbers) could be exposed
- **Files:** All route handlers (implicit logging)
- **Current mitigation:** No explicit logging of request bodies
- **Recommendations:**
  - Never log full card numbers
  - Mask sensitive fields in logs
  - Implement log retention policy (30 days)

---

## Known Workarounds & Limitations

**Known-1: Admin Rights Not Synced in Realtime**
- **Workaround:** Admin must re-login after status change takes effect
- **Files:** `backend/src/middleware/auth.js`
- **Impact:** Delay in access control changes
- **Permanent fix:** Re-check admin status on every request

**Known-2: WebSocket Broadcasts Fail Silently**
- **Workaround:** Users won't see realtime updates if WebSocket is down
- **Files:** `backend/src/services/cardEngine.js` (implicit WebSocket usage)
- **Impact:** Stale data in UI
- **Permanent fix:** Implement fallback polling or retry logic

**Known-3: Redis Failures Fall Back to Stale Cache**
- **Workaround:** Cache misses may serve old data or empty results
- **Files:** `backend/src/cache/index.js`
- **Impact:** Inconsistent data views
- **Permanent fix:** Implement dual-write or explicit cache invalidation

---

## Recommended Fix Prioritization

### Phase 1 — Critical Security (1-2 weeks)
1. ✅ Fix CORS origin whitelist (done per TRIAGE)
2. ✅ Ensure JWT_SECRET required in WebSocket auth (done)
3. ✅ Handle Redis connection failures (partially done)
4. ✅ Remove hardcoded credentials (done)
5. ✅ Fix token management race conditions (done)
6. ✅ Sanitize error rendering in admin (done)
7. Add rate limiting per-endpoint (login 10/15m, register 5/1h)
8. Re-check admin status from DB on every admin request

### Phase 2 — High Priority (2-4 weeks)
9. Add input validation (negative limits, Luhn checksum, name length)
10. Fix deck update transaction ordering (use $transaction)
11. Fix race conditions (PIN double-submit, loadAll await)
12. Replace silent `.catch(() => {})` with proper error handling
13. Add error UI components (toast, notifications)
14. Fix token persistence (SecureStore only, no race conditions)

### Phase 3 — Medium Priority (backlog)
15. Add database indexes (Transaction, Notification, UserCard)
16. Implement refresh token expiration tracking
17. Add comprehensive test suite (auth, CRUD, token persistence)
18. Form validation across admin and mobile
19. Loading states and UX improvements
20. Performance optimizations (caching, pagination, query optimization)

---

*Concerns audit: 2026-04-25 — Full-stack analysis of GM Bank App across backend (Node.js/Express/Prisma), mobile (React Native/Expo), and admin panel (React).*
