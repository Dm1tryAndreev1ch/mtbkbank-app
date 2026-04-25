# Architecture

**Analysis Date:** 2026-04-25

## Pattern Overview

**Overall:** Monorepo with three independent sub-projects communicating via shared backend API and WebSocket server. Each sub-project is a separate deployment unit with distinct entry points and technology stacks.

**Key Characteristics:**
- REST API + WebSocket server (backend) acts as single source of truth
- Three independent frontend clients (mobile, admin, card collection display)
- Shared PostgreSQL database via Prisma ORM
- JWT-based authentication with role separation (user vs. admin)
- Real-time updates via Socket.IO broadcast channels
- Card game mechanics with deck management, trading, and quests

## Layers

**Backend (Express API Server):**
- Purpose: Primary business logic, data persistence, real-time updates, authentication
- Location: `/Users/andreevich/Documents/Projects/gm-bank-app/backend/src/`
- Contains: Route handlers, middleware, services, database schema, WebSocket setup
- Depends on: PostgreSQL (via Prisma), Redis (caching), Expo SDK (push notifications), Node.js runtime
- Used by: Mobile app, admin web client, scheduled tasks (cron)

**Mobile App (React Native + Expo):**
- Purpose: User-facing client for banking operations, card collection, game mechanics
- Location: `/Users/andreevich/Documents/Projects/gm-bank-app/mobile/`
- Contains: Screens (routes via expo-router), components, state management (Zustand), API client
- Depends on: Backend API at `/api/*`, Zustand store for local state, Socket.IO for real-time events
- Used by: End users on iOS/Android/Web

**Admin Dashboard (React + Vite):**
- Purpose: Admin panel for user management, data inspection, deck verification, reports
- Location: `/Users/andreevich/Documents/Projects/gm-bank-app/admin/src/`
- Contains: Single-page app (App.jsx), component structure, token-based API interaction
- Depends on: Backend `/api/admin/*` endpoints, localStorage for token persistence
- Used by: Bank administrators

**Card Collection Display:**
- Purpose: Read-only view of recent operations (possibly for public display or reports)
- Location: `/Users/andreevich/Documents/Projects/gm-bank-app/recent_operations_view_all/`
- Contains: Static HTML with Tailwind styling (code.html)
- Depends on: Screenshot asset (screen.png)
- Used by: Documentation, design reference, or public portal

## Data Flow

**User Login Flow:**

1. Mobile/Admin sends POST to `/api/auth/login` with phone + pin
2. Backend validates via `authMiddleware` (JWT verification), rate limits applied
3. Backend returns `accessToken` (15m TTL) + `refreshToken` (30d TTL) + user data
4. Client stores token in secure store (mobile) or localStorage (admin)
5. Subsequent requests include `Authorization: Bearer <token>` header
6. Backend middleware (`authMiddleware` in `/backend/src/middleware/auth.js`) extracts `userId` and `isAdmin` from JWT

**Transaction/Account Data Flow:**

1. Mobile app calls `loadTransactions()` (Zustand action)
2. `axios` request to `/api/transactions?limit=20&offset=0` with Bearer token
3. Backend route handler (`/backend/src/routes/transactions.js`) authenticates via middleware
4. Handler queries Prisma client (attached to `req.prisma`) for user's transactions
5. Optional Redis caching for analytics (`/api/transactions/analytics`)
6. Response JSON serialized to client
7. Client updates Zustand store state (`store.transactions`)
8. React components re-render based on store subscription

**Real-Time Events (WebSocket):**

1. Mobile establishes Socket.IO connection at boot (URL determined by dev/prod environment)
2. Client sends auth token in handshake; server validates via JWT in `/backend/src/websocket/index.js`
3. Server registers user in `connectedUsers` map
4. When backend API modifies data (e.g., transfer accepted), services call `broadcastToUser(userId, 'transfer:accepted', {...})`
5. Client receives event and updates local state
6. Components react to state changes

**Admin API Interaction:**

1. Admin logs in to `/api/auth/login` with phone + pin + `asAdmin: true` intent
2. Backend returns token only if `user.isAdmin === true`
3. Admin dashboard stores token in localStorage
4. Requests to `/api/admin/...` endpoints must pass `adminMiddleware` check
5. Admin can view/modify user data, verify decks, trigger system operations

**State Management (Mobile):**

1. Zustand store (`/mobile/stores/useStore.ts`) holds global app state: user, accounts, transactions, cards, decks, notifications
2. Store actions invoke API calls via `/mobile/services/api.ts` (axios client)
3. API client resolves backend URL from environment (dev: LAN IP detection, prod: env var)
4. Store persists tokens to `expo-secure-store` (encrypted)
5. On app boot, `loadToken()` restores session from secure store
6. Biometric guard (`BiometricGuard.tsx`) protects entry if enabled

## Key Abstractions

**Prisma Models:**
- Purpose: Enforce schema consistency, provide type-safe ORM queries
- Examples: `User`, `BankAccount`, `BankCard`, `UserCard`, `Deck`, `CardTrade`, `Transaction`, `Notification`
- Pattern: Models define relationships (one-to-many, many-to-many) via Prisma relations (@relation)
- Location: `/backend/prisma/schema.prisma`

**JWT Tokens:**
- Purpose: Stateless authentication for REST endpoints and WebSocket handshake
- Pattern: Signed with `process.env.JWT_SECRET`, includes `userId` + `isAdmin` claims
- Access token: 15m TTL (expires, requires refresh)
- Refresh token: 30d TTL (stored in DB for revocation support, marked FIX comment at line 63 of schema)
- Location: Created in `/backend/src/routes/auth.js`, verified in `/backend/src/middleware/auth.js`

**Services:**
- `CardEngine` (`/backend/src/services/cardEngine.js`): Game logic for card health decay, deck management
- `EnsureUserActiveDeck` (`/backend/src/services/ensureUserActiveDeck.js`): Ensures all users have active deck
- Both invoked on server startup and via scheduled intervals
- Pattern: Stateless functions accepting `prisma` client as dependency

**Zustand Store:**
- Purpose: Centralized state for mobile app (user, auth, data, UI state)
- Pattern: Single store with actions that call API methods
- Persistence: Token persisted to secure store; other state rehydrated on app launch
- Location: `/mobile/stores/useStore.ts`

**Route Hierarchy (Backend):**
- `/api/auth` — login, register, refresh, logout
- `/api/users` — user profile, settings
- `/api/accounts` — bank accounts
- `/api/transactions` — transaction history, analytics
- `/api/cards` — card management (user-owned card collection)
- `/api/decks` — deck CRUD and active deck selection
- `/api/trades` — card trading between users
- `/api/quests` — quest progression
- `/api/payments`, `/api/subscriptions`, `/api/limits`, `/api/notifications` — feature-specific endpoints
- `/api/admin` — admin-only operations (requires `adminMiddleware`)

**Route Hierarchy (Mobile):**
- `(tabs)/_layout.tsx` — Bottom tab navigator with 6 screens
- `(tabs)/index.tsx` — Home/dashboard
- `(tabs)/account.tsx` — Account and profile
- `(tabs)/cards.tsx` — Card collection and decks
- `(tabs)/payments.tsx` — Payment operations
- `(tabs)/analytics.tsx` — Spending analytics
- `(tabs)/products.tsx` — Products/shop
- `login.tsx`, `register.tsx`, `onboarding.tsx` — Auth flows (route-based redirects via biometric guard)
- `payment.tsx`, `transfer.tsx`, `topup.tsx` — Transactional flows (modal-like via router params)
- `qr.tsx`, `split-bill.tsx`, `trade.tsx` — Feature screens

## Entry Points

**Backend Server:**
- Location: `/backend/src/index.js`
- Triggers: `npm run dev` (nodemon) or `npm start` (node)
- Responsibilities: 
  - Initialize Express app with CORS, helmet, rate limiters
  - Register route middlewares
  - Start server on `PORT` (default 3000)
  - Launch scheduled `tickActiveDeckCardHealth()` every `ACTIVE_DECK_HP_TICK_MS` (default 60s)
  - Ensure all users have active deck on startup
  - Attach Prisma client to `req.prisma` for all routes

**Mobile App:**
- Location: `/mobile/app/_layout.tsx` (root layout via expo-router)
- Triggers: `npm start`, `npm run ios`, `npm run android`, `npm run web`
- Responsibilities:
  - Load custom fonts (Manrope variants)
  - Initialize theme provider (light/dark/system)
  - Set up biometric guard to protect entry
  - Mount Stack navigator from expo-router
  - On boot: restore token from secure store, load user data

**Admin Dashboard:**
- Location: `/admin/src/main.jsx` (Vite entry), rendered to `#root` in HTML
- Triggers: `npm run dev` (vite dev server), `npm run build` (static export), `npm run preview`
- Responsibilities:
  - Mount React app (App.jsx) into DOM
  - Restore theme preference from localStorage
  - Render login page or admin dashboard based on token validity

**Card Collection Display:**
- Location: `/recent_operations_view_all/code.html`
- Triggers: Open directly in browser
- Responsibilities: Render static history view with Tailwind dark theme (no API calls)

## Error Handling

**Strategy:** Client-server error propagation with user-facing messages in Russian.

**Patterns:**

- **Backend Routes:** Try-catch blocks catch errors, return `{ error: "message" }` with appropriate HTTP status (400 validation, 401 auth, 403 forbidden, 500 server error)
- **Client API Calls:** Error caught in Zustand actions, stored in `store.error` state, displayed via `AppAlert` component
- **Rate Limits:** `express-rate-limit` returns 429 with Russian error message if exceeded
- **Validation:** `express-validator` checks incoming data; validation errors returned as `{ errors: [...] }` in 400 response
- **Database:** Prisma errors logged to console; user sees generic "Ошибка сервера" (Server error)
- **WebSocket:** JWT auth failure returns `Error('Authentication error')` from middleware, client falls back to polling

## Cross-Cutting Concerns

**Logging:** 
- Backend: `console.log/error` to stdout (no structured logging library detected)
- Mobile: Errors logged to console; no crash reporting detected
- Pattern: Debug markers in console (e.g., `[active-deck-hp]`, `🔌 Socket Connected`)

**Validation:**
- Backend: `express-validator` for request body/query validation (seen in auth routes)
- Backend: Custom validators for Luhn algorithm (card number), phone normalization
- Mobile: Minimal client-side validation; relies on API errors for feedback

**Authentication:**
- Backend: JWT tokens (HS256, inferred from `jsonwebtoken` usage)
- Backend: Role-based access (`isAdmin` claim checked by `adminMiddleware`)
- Mobile: Tokens stored in encrypted secure store (`expo-secure-store`)
- Admin: Tokens stored in localStorage (less secure but acceptable for internal admin panel)
- Pattern: Bearer token in `Authorization` header for all authenticated requests

**Caching:**
- Backend: Redis client used for analytics caching (key pattern: `analytics:{userId}:{period}`)
- Pattern: Check cache before DB query; cache miss falls through to DB
- TTL not visible in route excerpts (likely set per endpoint)

**Rate Limiting:**
- Backend: Login (10/15min), register (5/1h), refresh (30/15min) via `express-rate-limit`
- Pattern: Generous limits to avoid blocking legitimate users; message in Russian

**Real-Time Updates:**
- Backend: Socket.IO server with JWT auth in handshake
- Pattern: `broadcastToUser`, `broadcastToMany`, `broadcastToAll` functions
- Use case: Push notifications for transfers, trades, quest completions
- Mobile: Listens to events and updates Zustand store (triggering re-renders)

---

*Architecture analysis: 2026-04-25*
