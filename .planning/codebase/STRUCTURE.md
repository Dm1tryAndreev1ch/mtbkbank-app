# Codebase Structure

**Analysis Date:** 2026-04-25

## Directory Layout

```
gm-bank-app/                                    # Monorepo root
├── admin/                                      # Admin web dashboard (React + Vite)
│   ├── public/                                 # Static assets
│   ├── src/
│   │   ├── main.jsx                            # Vite entry point
│   │   ├── App.jsx                             # Main component (login → dashboard)
│   │   └── index.css                           # Tailwind/global styles
│   ├── package.json                            # Vite, React, React-DOM
│   ├── vite.config.js                          # (implied)
│   └── index.html                              # (implied)
│
├── backend/                                    # Express API server + WebSocket
│   ├── prisma/
│   │   └── schema.prisma                       # PostgreSQL schema (Prisma ORM)
│   ├── src/
│   │   ├── index.js                            # Entry point; app bootstrap
│   │   ├── middleware/
│   │   │   └── auth.js                         # JWT verification, authMiddleware, adminMiddleware
│   │   ├── routes/                             # Express route handlers (13 route files)
│   │   │   ├── auth.js                         # POST /login, /register, /refresh, /logout
│   │   │   ├── users.js                        # GET/PUT /users, /users/:id
│   │   │   ├── accounts.js                     # Bank accounts
│   │   │   ├── transactions.js                 # GET /transactions, /analytics
│   │   │   ├── cards.js                        # Card CRUD
│   │   │   ├── decks.js                        # Deck management
│   │   │   ├── trades.js                       # Card trading
│   │   │   ├── quests.js                       # Quest progression
│   │   │   ├── payments.js                     # Payment processing
│   │   │   ├── limits.js                       # Spending limits
│   │   │   ├── notifications.js                # Notification retrieval
│   │   │   ├── subscriptions.js                # Subscription management
│   │   │   └── admin.js                        # Admin-only endpoints (requires adminMiddleware)
│   │   ├── services/                           # Business logic functions
│   │   │   ├── cardEngine.js                   # Card health decay, deck ticking
│   │   │   └── ensureUserActiveDeck.js         # Ensures all users have active deck
│   │   ├── websocket/
│   │   │   └── index.js                        # Socket.IO server setup, broadcast functions
│   │   ├── push/
│   │   │   └── index.js                        # Expo SDK push notification handler
│   │   ├── cache/
│   │   │   └── (redis client setup)            # (inferred from routes using getCached/setCached)
│   │   ├── middleware/
│   │   │   └── auth.js                         # (see above)
│   │   ├── seed/
│   │   │   └── index.js                        # Database seeding for dev
│   │   └── scripts/
│   │       └── ensure-active-decks.js          # CLI to ensure decks exist
│   ├── package.json                            # Express, Prisma, Socket.IO, Redis, JWT, Helmet, CORS
│   └── .env                                    # (not committed; contains DATABASE_URL, JWT_SECRET, PORT, etc.)
│
├── mobile/                                     # React Native + Expo app
│   ├── app/                                    # expo-router file-based routing
│   │   ├── _layout.tsx                         # Root layout; theme provider, biometric guard
│   │   ├── index.tsx                           # Redirect to (tabs) or login
│   │   ├── login.tsx                           # Login form
│   │   ├── register.tsx                        # Registration form
│   │   ├── onboarding.tsx                      # Onboarding flow
│   │   ├── (tabs)/                             # Tab-based navigation (6 screens)
│   │   │   ├── _layout.tsx                     # Bottom tab navigator
│   │   │   ├── index.tsx                       # Home/Dashboard
│   │   │   ├── account.tsx                     # Profile/Account settings
│   │   │   ├── cards.tsx                       # Card collection & decks
│   │   │   ├── payments.tsx                    # Payment operations
│   │   │   ├── analytics.tsx                   # Spending charts/analytics
│   │   │   └── products.tsx                    # Shop/Products
│   │   ├── payment.tsx                         # Payment flow (modal/params-based)
│   │   ├── transfer.tsx                        # P2P transfer flow
│   │   ├── topup.tsx                           # Account top-up
│   │   ├── qr.tsx                              # QR code scanning/generation
│   │   ├── split-bill.tsx                      # Bill splitting
│   │   ├── trade.tsx                           # Card trading
│   │   ├── history.tsx                         # Transaction history
│   │   ├── limits.tsx                          # Spending limits
│   │   ├── card-details.tsx                    # Individual card detail view
│   │   ├── collection.tsx                      # Card collection full view
│   │   ├── notifications.tsx                   # Notifications center
│   │   └── transaction/                        # Transaction detail screens
│   │       └── (details pages)
│   ├── components/                             # Reusable React Native components
│   │   ├── AppAlert.tsx                        # Global alert/toast handler
│   │   ├── BiometricGuard.tsx                  # Biometric unlock gate
│   │   ├── CardDropReveal.tsx                  # Animated card reveal
│   │   ├── Themed.tsx                          # Theme-aware styling wrapper
│   │   ├── EditScreenInfo.tsx, ExternalLink.tsx, StyledText.tsx
│   │   ├── useColorScheme.ts                   # Platform-specific theme detection
│   │   ├── useClientOnlyValue.ts/web.ts        # Platform-specific utilities
│   │   └── __tests__/                          # Component unit tests
│   ├── stores/
│   │   └── useStore.ts                         # Zustand global state (user, accounts, transactions, decks, etc.)
│   ├── services/
│   │   └── api.ts                              # Axios HTTP client with dev/prod API URL resolution
│   ├── hooks/
│   │   ├── useAppAlert.ts                      # Hook to trigger global alerts
│   │   └── useThemeColor.ts                    # Hook for theme-aware colors
│   ├── constants/
│   │   └── (API URLs, theme colors, etc.)      # (likely present)
│   ├── assets/
│   │   ├── images/                             # PNG/SVG assets
│   │   └── fonts/                              # Custom font files
│   ├── e2e/                                    # End-to-end tests (Detox or similar)
│   ├── app.json                                # Expo app config
│   ├── app.config.js                           # (implied for dynamic config)
│   ├── package.json                            # Expo, React Native, Socket.IO client, Zustand, Axios
│   └── .env                                    # (not committed; contains EXPO_PUBLIC_API_ROOT, etc.)
│
├── recent_operations_view_all/                 # Static card history display
│   ├── code.html                               # Complete HTML page (Tailwind dark theme)
│   └── screen.png                              # Screenshot reference
│
├── docs/                                       # Documentation (non-code)
├── .claude/                                    # Claude AI tooling config
├── .github/                                    # GitHub Actions workflows (likely CI/CD)
├── .planning/                                  # GSD planning artifacts
│   └── codebase/                               # This file and other architecture docs
├── DEVELOPMENT.md                              # Setup and development guide
├── TRIAGE.md                                   # Reported issues/bug tracker
├── README.md                                   # Project overview
└── package.json                                # (monorepo root, may define workspace)
```

## Directory Purposes

**admin/ — Admin Web Dashboard:**
- Purpose: React SPA for admin users to manage bank operations, view analytics, verify decks
- Build tool: Vite (fast dev server, optimized production bundle)
- Styling: Tailwind CSS (inline via index.css)
- State: Stateful React components; token in localStorage; no global state library
- API: Direct fetch calls via `apiFetch()` helper; no HTTP client library
- Deployment: Static files after `vite build` (dist/)

**backend/src/index.js — Server Entry Point:**
- Initializes Express app with middleware stack
- Loads all 13 route modules
- Attaches Prisma client to `req.prisma`
- Starts HTTP server (port from `process.env.PORT`)
- Launches scheduled tasks (active deck HP tick every 60s)
- Does NOT start WebSocket server directly (inferred setup in websocket/index.js)

**backend/src/routes/ — HTTP Endpoints:**
- Each file exports an Express router for a domain (auth, users, accounts, etc.)
- Mounted as `app.use('/api/<domain>', router)` in index.js
- Route handler pattern: extract userId from JWT → query Prisma → return JSON
- Some routes use rate limiters or caching (Redis)

**backend/src/middleware/ — Cross-Cutting Logic:**
- `auth.js` exports `authMiddleware` (verifies JWT, extracts userId/isAdmin) and `adminMiddleware` (checks isAdmin flag)
- Applied to protected routes via `router.use(authMiddleware)`

**backend/src/services/ — Business Logic:**
- `cardEngine.js`: Implements card health decay mechanics; called by scheduled tick
- `ensureUserActiveDeck.js`: Ensures every user has an active deck (called on startup)
- Pattern: Pure functions accepting Prisma client as dependency; no side effects beyond DB

**backend/src/websocket/ — Real-Time Updates:**
- Sets up Socket.IO server with JWT auth in handshake
- Maintains `connectedUsers` map (userId → socketId)
- Exports broadcast functions: `broadcastToUser()`, `broadcastToMany()`, `broadcastToAll()`
- Called from route handlers when data changes (transfers, trades, etc.)

**mobile/app/ — Expo Router Screens:**
- `_layout.tsx` (root): Initializes theme, fonts, biometric guard; mounts Stack navigator
- `(tabs)/_layout.tsx` (tab group): Bottom tab navigator with 6 screens
- Each `.tsx` file is a screen/page (path-based routing via expo-router)
- Screens import Zustand store for global state and API calls

**mobile/stores/ — Global State (Zustand):**
- Single store: `useStore.ts`
- Holds: user object, auth tokens, accounts, transactions, cards, decks, quests, subscriptions, limits, notifications
- Actions: login, register, loadUser, loadTransactions, loadCards, etc. (each calls backend API)
- Persistence: tokens stored in `expo-secure-store` (encrypted); other state rehydrated on app boot

**mobile/services/ — HTTP Client:**
- `api.ts` exports axios instance configured for backend
- Dev-time API URL resolution: checks LAN IP from Metro bundle, debuggerHost, EXPO_PUBLIC_API_ROOT env var
- Prod-time: uses EXPO_PUBLIC_API_ROOT or hardcoded prod domain
- All requests include Bearer token from secure store

**mobile/components/ — Reusable UI:**
- `BiometricGuard.tsx`: Root wrapper that gates access (FaceID/fingerprint check before showing app)
- `AppAlert.tsx`: Global toast/alert system
- `CardDropReveal.tsx`: Animated card reveal animation
- Theme and utility components

**recent_operations_view_all/ — Static Display:**
- `code.html`: Standalone HTML page (no API, no runtime)
- Tailwind dark theme, Material Design icons
- Used for design reference, screenshots, or public history portal

## Key File Locations

**Entry Points:**
- `backend/src/index.js` — HTTP server bootstrap
- `mobile/app/_layout.tsx` — Mobile app root with Expo Router
- `admin/src/main.jsx` — Admin dashboard React mount point

**Configuration:**
- `backend/prisma/schema.prisma` — Database schema, models, enums
- `admin/src/App.jsx` — Admin login logic, API URL resolution, token management
- `mobile/stores/useStore.ts` — App state schema and actions

**Core Logic:**
- `backend/src/routes/*.js` — HTTP endpoint handlers
- `backend/src/services/*.js` — Card game and deck mechanics
- `mobile/app/(tabs)/*.tsx` — Main user-facing screens
- `backend/src/websocket/index.js` — Real-time event broadcasting

**Testing:**
- `mobile/components/__tests__/` — Component unit tests (Jest/React Test Renderer)
- (No backend tests detected in exploration; likely in test files not in routes/ or services/)

## Naming Conventions

**Files:**
- Backend routes: lowercase domain name + `.js` (e.g., `auth.js`, `transactions.js`)
- Backend services: camelCase descriptive name + `.js` (e.g., `cardEngine.js`, `ensureUserActiveDeck.js`)
- Mobile screens: lowercase-with-hyphens or camelCase `.tsx` (e.g., `split-bill.tsx`, `card-details.tsx`)
- Mobile components: PascalCase `.tsx` (e.g., `BiometricGuard.tsx`, `CardDropReveal.tsx`)
- Stores: `use<StoreName>.ts` (Zustand convention) (e.g., `useStore.ts`)
- Hooks: `use<HookName>.ts` (React convention) (e.g., `useAppAlert.ts`, `useThemeColor.ts`)

**Directories:**
- Tab screens: grouped in `(tabs)/` using Expo Router groups
- Transactional flows: feature screens at root of `app/` (e.g., `payment.tsx`, `transfer.tsx`)
- Components: plural `components/`, singular screen names in `app/`
- Stores: plural `stores/`, services: plural `services/`, hooks: plural `hooks/`

**Functions & Classes:**
- Express route handlers: lowercase file exports (router, middleware)
- Services: camelCase functions (e.g., `tickActiveDeckCardHealth`, `ensureAllUsersHaveActiveDeck`)
- Zustand actions: camelCase (e.g., `login`, `loadTransactions`, `markNotificationRead`)
- React components: PascalCase (e.g., `BiometricGuard`, `AppAlert`)
- Utilities: camelCase (e.g., `withApiBase`, `normalizePhone`, `luhnValid` in auth.js)

**API Routes:**
- Pattern: `/api/<resource>/<operation>`
- Examples: `/api/auth/login`, `/api/transactions`, `/api/cards/trade`, `/api/admin/users`
- Query params for pagination: `?limit=20&offset=0`
- Query params for filtering: `?period=month`, `?category=transfer`

## Where to Add New Code

**New Feature (e.g., Bill Splitting):**
- **Backend:**
  - Create `/backend/src/routes/billsplit.js` with CRUD endpoints
  - Add Prisma models if needed (e.g., `BillSplit`, `BillSplitParticipant` in schema.prisma)
  - Add service logic in `/backend/src/services/` if complex
  - Register route in `index.js`: `app.use('/api/billsplit', billSplitRoutes)`
- **Mobile:**
  - Create `/mobile/app/billsplit.tsx` or `/mobile/app/(tabs)/billsplit.tsx` if tab screen
  - Add Zustand actions in `stores/useStore.ts` for `loadBillSplits`, `createBillSplit`, etc.
  - Create components in `/mobile/components/BillSplit*.tsx` as needed
  - Import and use store actions in screen

**New Screen/Page:**
- **Mobile:**
  - File path depends on routing hierarchy:
    - Tab-based: `/mobile/app/(tabs)/featurename.tsx`
    - Modal/overlay: `/mobile/app/featurename.tsx` (route via params)
    - Detail page: `/mobile/app/featurename/[id].tsx` (dynamic route)
  - Export default screen component (React Native View-based)
  - Import `useStore` from `../stores/useStore` for global state
  - Call store actions in `useEffect` or `useState` handlers

**New Component:**
- **Mobile:**
  - Create `/mobile/components/FeatureName.tsx`
  - Use theme colors via `useThemeColor()` hook
  - Follow pattern in existing components (use Themed wrapper for dark mode safety)
  - Add tests in `/mobile/components/__tests__/FeatureName.test.tsx` if unit-testable

**New Admin Feature:**
- **Admin Dashboard:**
  - Add form/table logic in `/admin/src/App.jsx` (App.jsx is monolithic; consider refactoring)
  - Call API via `apiFetch('/api/admin/...', { method, body })` 
  - Display errors via `setError()` state
  - Request must have Bearer token from `tokenRef.current`

**New Backend Service (Reusable Logic):**
- Create `/backend/src/services/<domain>Service.js` (e.g., `paymentService.js`)
- Export functions that accept Prisma client: `async function processPayment(prisma, userId, amount) { ... }`
- Call from routes: `const result = await paymentService.processPayment(req.prisma, req.userId, amount)`

**New Middleware:**
- Create in `/backend/src/middleware/<name>.js`
- Export function matching Express middleware signature: `(req, res, next) => { ... }`
- Apply in route files: `router.use(middlewareName)` or per-route: `router.get('/', middlewareName, handler)`

**Database Migration:**
- Edit `/backend/prisma/schema.prisma` (add/modify models)
- Run `npm run db:migrate` (creates migration file in prisma/migrations/)
- Commit migration file to git

## Special Directories

**backend/prisma/migrations/:**
- Purpose: Version control for database schema changes
- Generated: Yes (auto-created by `prisma migrate dev`)
- Committed: Yes (tracked in git for reproducible schema history)

**mobile/e2e/:**
- Purpose: End-to-end test suite (likely Detox for React Native)
- Generated: No (written by developers)
- Committed: Yes

**mobile/assets/:**
- Purpose: Static images, fonts, icons (not generated)
- Generated: No
- Committed: Yes

**.planning/codebase/:**
- Purpose: GSD codebase architecture documentation
- Generated: Yes (via gsd-codebase-mapper)
- Committed: Yes

**backend/node_modules/, mobile/node_modules/, admin/node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (via npm/yarn install)
- Committed: No (.gitignore)

**backend/.env, mobile/.env, admin/.env**
- Purpose: Environment variables (secrets, API URLs, feature flags)
- Generated: No (created manually per deployment environment)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-04-25*
