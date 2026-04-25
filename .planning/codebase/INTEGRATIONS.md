# External Integrations

**Analysis Date:** 2026-04-25

## APIs & External Services

### Push Notifications (Expo)

**Service:** Expo Push Notification Service

- **SDK/Client:** `expo-server-sdk` v6.1.0
- **Implementation:** `backend/src/push/index.js`
- **Usage:**
  - Sends push notifications to Expo-registered push tokens
  - Function: `sendPushNotification(expoPushToken, title, body, data)`
  - Specific use case: Card death warning when card HP approaches zero
  - Function: `sendCardDeathWarningPush(user, cardName, currentHealth)`
- **Authentication:** None required (public Expo push service)
- **Mobile side:** 
  - Push tokens obtained via Expo (token stored in user profile)
  - Client library: Standard Expo notification APIs (via `expo`)
- **Webhook:** No incoming webhooks; one-directional push delivery

---

## Data Storage

### Databases

**Primary Database: PostgreSQL 16**

- **Connection:** Environment variable `DATABASE_URL`
- **Example:** `postgresql://USER:PASSWORD@localhost:5432/mtbbank`
- **ORM/Client:** Prisma 6.5.0
- **Schema file:** `backend/prisma/schema.prisma`
- **Migrations:** `backend/prisma/migrations/`
- **Key entities:**
  - Users (authentication, status tiers: STANDARD/SILVER/GOLD/PLATINUM/BLOCKED)
  - Cards (with rarity: COMMON/RARE/EPIC/LEGENDARY; health system)
  - Accounts (bank-like accounts)
  - Transactions (purchase/transfer/topup/payment/subscription/admin adjustment)
  - Trades (PENDING/ACCEPTED/REJECTED/CANCELLED)
  - Decks (active card collections)
  - Quests (gameplay)
  - Subscriptions (recurring billing)
  - Push tokens (Expo)
- **Setup:** `npm run db:push` or `npm run db:migrate`

**Caching: Redis 7**

- **Connection:** Environment variable `REDIS_URL`
- **Example:** `redis://localhost:6379`
- **Client:** `redis` npm package v5.12.1
- **Implementation:** `backend/src/cache/index.js`
- **Features:**
  - Graceful fallback if Redis unavailable
  - Key-value caching with TTL support
  - Pattern-based key invalidation
  - Functions: `getCached(key)`, `setCached(key, value, ttlSeconds)`, `invalidatePattern(pattern)`
- **Connection handling:** Automatic reconnection; emits connect/error/reconnecting events
- **Health check:** Monitors `redisClient.isReady` flag

**File Storage:**

- None detected in external services
- Mobile app can capture screenshots via `react-native-view-shot` (local device storage only)

---

## Authentication & Identity

### Authentication Provider

**Type:** Custom JWT-based authentication

- **Implementation:** `backend/src/routes/auth.js`
- **JWT Library:** `jsonwebtoken` v9.0.2
- **Password Hashing:** `bcryptjs` v2.4.3
- **Secret:** Environment variable `JWT_SECRET`
- **Token Types:**
  - **Access Token:** 15-minute expiry (used for API calls)
  - **Refresh Token:** 30-day expiry (used to refresh expired access tokens)
- **Token Payload:** `{ userId, isAdmin }`
- **Authentication Flow:**
  - Login endpoint: `POST /api/auth/login` (rate-limited to 10 attempts per 15 min)
  - Register endpoint: `POST /api/auth/register` (rate-limited to 5 per hour)
  - Refresh endpoint: Uses `refreshToken` to issue new access token (rate-limited to 30 per 15 min)
- **Card Validation:** Luhn algorithm validation for card numbers
- **Phone Normalization:** International format (+7 for Russian numbers)

**Mobile Storage of Credentials:**

- **Access tokens:** Stored in device memory (app session)
- **Refresh tokens:** Stored in secure storage via `expo-secure-store` (~15.0.8)
- **Implementation:** `mobile/services/api.ts`

**Biometric Authentication:**

- **Library:** `expo-local-authentication` (~17.0.8)
- **Platforms:** iOS (Face ID) and Android (fingerprint/face)
- **Scope:** Login via biometric after initial credential setup

### Admin Authentication

- **Same JWT mechanism** as users
- **Admin flag:** `isAdmin` property in token
- **Login required:** `POST /api/auth/login` with admin credentials
- **Rate limited:** Same as user login (10 attempts per 15 minutes)

---

## Monitoring & Observability

**Error Tracking:**

- Not detected (no Sentry, Bugsnag, etc.)

**Logging:**

- **Approach:** Console-based logging (console.log, console.error, console.warn)
- **Backend:** Simple console output from `backend/src/` files
- **Mobile:** Console output from Expo runtime
- **Key logs:** Socket connection status, Redis cache status, push notifications

**Health Checks:**

- **Backend health endpoint:** `GET /` → returns service info and `/health` path
- **Database readiness:** Docker Compose includes PostgreSQL healthcheck (pg_isready)
- **Redis readiness:** Redis container starts but no explicit health check in compose

---

## CI/CD & Deployment

**Hosting:**

- **Backend:** Docker containerization
  - Image: `node:20-alpine`
  - Dockerfile: `backend/Dockerfile`
  - Exposed ports: 3000 (API)
- **Admin:** Static SPA deployment (after `npm run build`)
  - Suggested: Nginx, Vercel, AWS S3+CloudFront, GitHub Pages, etc.
- **Mobile:** Expo platform (cloud builds via EAS Build, or local compile)
  - iOS: TestFlight or App Store
  - Android: Google Play or APK sideload
  - Web: Expo web build

**CI Pipeline:**

- Not detected (no GitHub Actions, GitLab CI, Jenkins, etc.)
- GitHub repository present (`.github/` directory exists)

**Docker Compose Services:**

```yaml
# backend/docker-compose.yml
- postgres:16-alpine        → PostgreSQL database
- redis:7-alpine            → Redis cache
- api (custom Node.js build) → Express backend
```

---

## Environment Configuration

### Backend (Node.js)

**Required Variables:**

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for token signing
- `PORT` - HTTP server port (default 3000)
- `NODE_ENV` - Environment mode (development/production)

**Optional Variables:**

- `ACTIVE_DECK_HP_TICK_MS` - Health loss tick interval (milliseconds; default 60000)
- `ACTIVE_DECK_HP_LOSS_PER_TICK` - HP lost per tick (default 1)
- `ACTIVE_DECK_LOW_HP_THRESHOLD` - Warning threshold (default 30)
- `ALLOWED_ORIGINS` - CORS whitelist (defaults: localhost:5173, 127.0.0.1:5173, localhost:3000, 127.0.0.1:3000)

**File:** `backend/.env.example`

### Admin Frontend

**Optional Variables:**

- `ADMIN_BACKEND_URL` - Backend URL for Vite proxy (default http://127.0.0.1:3000)
- `VITE_API_ORIGIN` - Direct API origin (alternative to proxy)
- `VITE_API_BASE_URL` - Full API base URL

**File:** `admin/.env.example`

### Mobile App

**Required Variables:**

- `EXPO_PUBLIC_API_URL` - Backend API URL (e.g., http://192.168.1.5:3000)

**File:** `mobile/.env.example`

**Config in code:**

- `mobile/services/api.ts` - API base URL resolution with fallback logic:
  1. `EXPO_PUBLIC_API_URL` from .env
  2. LAN host detection (debuggerHost → hostUri → scriptURL)
  3. Platform-specific defaults (Android emulator, iOS, etc.)
  4. Fallback: 192.168.1.100:3000

**Secrets Location:**

- `.env` files (not committed; excluded in `.gitignore`)
- Expo secure storage: `expo-secure-store` for refresh tokens
- Docker Compose: Environment variables in service definitions (development only)

---

## Webhooks & Callbacks

**Incoming Webhooks:**

- None detected

**Outgoing Webhooks:**

- None detected

**Real-time Communication:**

- **WebSocket Protocol:** Socket.IO v4.8.3
- **Backend:** `backend/src/websocket/index.js`
- **Mobile client:** `socket.io-client` v4.8.3
- **Features:**
  - JWT authentication required on connection
  - User tracking (connectedUsers map: userId → socketId)
  - Broadcasting to specific users
  - Example: Real-time trade updates, transaction notifications
- **CORS:** Configured with same origins as REST API

---

## Data Flow Summary

1. **Mobile App** (React Native via Expo)
   - Authenticates via `POST /api/auth/login` → gets JWT tokens
   - Stores refresh token in secure storage (`expo-secure-store`)
   - Makes REST API calls via Axios to `EXPO_PUBLIC_API_URL/api/*`
   - Connects WebSocket via Socket.IO with JWT auth
   - Receives push notifications via Expo services

2. **Admin Frontend** (React + Vite)
   - Authenticates via same `/api/auth/login`
   - Proxied to backend via Vite dev server or direct calls
   - Manages users, cards, transactions, decks via REST API

3. **Backend API** (Express)
   - Validates all requests with JWT middleware
   - Queries PostgreSQL via Prisma ORM
   - Caches responses in Redis (with graceful fallback)
   - Broadcasts updates via Socket.IO to connected clients
   - Sends push notifications via Expo SDK for card warnings
   - Runs scheduled tasks via node-cron (e.g., card health decay)

4. **Database & Cache**
   - PostgreSQL: Persistent data storage
   - Redis: Session/cache layer (optional; app functions without it)

---

## Key Integration Points (File Paths)

| Integration | Files |
|-------------|-------|
| **JWT Auth** | `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`, `mobile/services/api.ts` |
| **Expo Push** | `backend/src/push/index.js` |
| **Prisma ORM** | `backend/prisma/schema.prisma`, `backend/src/routes/*.js` |
| **Redis Cache** | `backend/src/cache/index.js` |
| **Socket.IO** | `backend/src/websocket/index.js`, `mobile/stores/useStore.ts` |
| **Axios HTTP** | `mobile/services/api.ts`, `admin/src/App.jsx` |
| **Expo Secure Store** | `mobile/services/api.ts` |
| **Biometric Auth** | `mobile/` (Expo local auth API integration) |
| **Docker/Compose** | `backend/Dockerfile`, `backend/docker-compose.yml` |

---

*Integration audit: 2026-04-25*
