# Technology Stack

**Analysis Date:** 2026-04-25

## Sub-Project Overview

This is a multi-project monorepo containing an admin web interface, backend API, and mobile app for MTBBank (a banking-themed card game platform).

---

## Admin Frontend

**Location:** `admin/`

### Languages

- **JavaScript** - Build and app code
- **JSX** - React components

### Runtime & Build

**Environment:**
- Node.js (inferred from package-lock.json)
- npm package manager
- Lockfile: `admin/package-lock.json` (present)

**Build Tools:**
- **Vite** 6.0.0 - Fast bundler and dev server
- **@vitejs/plugin-react** 4.3.0 - React support for Vite
- Dev port: 5173 (from `admin/vite.config.js`)
- Build output: Standard Vite dist folder

### Frameworks & Libraries

**Core:**
- **React** 19.0.0 - UI framework

**Utilities:**
- Standard browser fetch API for HTTP requests (no external HTTP client)

### Scripts

```bash
npm run dev       # Vite dev server on :5173
npm run build     # Production bundle
npm run preview   # Preview built app
```

### Configuration

**Key files:**
- `admin/vite.config.js` - Vite configuration with React plugin and API proxy
- `admin/.env.example` - Environment variables for backend URL
- Backend proxy target configured via `ADMIN_BACKEND_URL` env var (defaults to http://127.0.0.1:3000)

---

## Backend API

**Location:** `backend/`

### Languages

- **Node.js** (JavaScript ES5/ES6)

### Runtime & Build

**Environment:**
- Node.js 20 (from `backend/Dockerfile`: `node:20-alpine`)
- npm package manager
- Lockfile: `backend/package-lock.json` (present)

**Build Tools:**
- Docker containerization with Alpine Linux base

### Frameworks & Libraries

**Core:**
- **Express** 4.21.0 - HTTP server framework
- **Prisma** 6.5.0 - ORM and database toolkit (`@prisma/client`, `prisma` package)

**Security & Middleware:**
- **Helmet** 8.1.0 - HTTP security headers
- **CORS** 2.8.5 - Cross-origin request handling
- **Express-rate-limit** 8.3.2 - Rate limiting for auth endpoints
- **Express-validator** 7.3.2 - Request validation
- **bcryptjs** 2.4.3 - Password hashing
- **jsonwebtoken** 9.0.2 - JWT token generation and verification

**Real-time & WebSockets:**
- **Socket.IO** 4.8.3 - Real-time communication server

**Storage & Caching:**
- **Redis** 5.12.1 - In-memory cache client (graceful fallback if unavailable)
- **Multer** 1.4.5-lts.1 - Multipart form data handling (file uploads)

**Scheduling:**
- **node-cron** 3.0.3 - Cron job scheduling for background tasks

**Push Notifications:**
- **expo-server-sdk** 6.1.0 - Expo push notification service integration

**Environment:**
- **dotenv** 16.4.5 - Environment variable loading

### Testing

- **Jest** 30.3.0 - Test framework
- Scripts: `npm test`

### Development Tools

- **nodemon** 3.1.0 - Auto-restart on file changes (`npm run dev`)

### Scripts

```bash
npm run dev              # Run with nodemon (auto-reload)
npm start                # Production start
npm test                 # Jest test suite
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run Prisma migrations
npm run db:push          # Push schema to DB
npm run db:seed          # Seed database with initial data
npm run db:ensure-decks  # Ensure active card decks exist
npm run db:reset         # Reset DB and reseed
```

### Configuration

**Key files:**
- `backend/.env.example` - Environment variables template
- `backend/docker-compose.yml` - Docker Compose services (PostgreSQL, Redis, API)
- `backend/Dockerfile` - Docker build for Node.js 20
- `backend/prisma/schema.prisma` - Database schema (Prisma)
- `backend/src/index.js` - Express server entry point

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for signing JWT tokens
- `PORT` - HTTP server port (default 3000)
- `NODE_ENV` - Environment (development/production)
- `ACTIVE_DECK_HP_TICK_MS` - Card health loss timer (milliseconds)
- `ACTIVE_DECK_HP_LOSS_PER_TICK` - HP subtracted per tick
- `ACTIVE_DECK_LOW_HP_THRESHOLD` - HP threshold for warning

---

## Mobile App

**Location:** `mobile/`

### Languages

- **TypeScript** 5.9.2 - Primary language
- **JavaScript** - Build/config code
- **JSX/TSX** - React Native components

### Runtime & Build

**Environment:**
- Node.js (inferred from package-lock.json)
- npm package manager
- Lockfile: `mobile/package-lock.json` (present)

**Build Platform:**
- **Expo** ~54.0.33 - React Native development platform
- **Expo Router** ~6.0.23 - File-based routing (similar to Next.js)
- **React Native** 0.81.5 - Native mobile framework

### Frameworks & Libraries

**Core:**
- **React** 19.1.0 - UI framework
- **React DOM** 19.1.0 - DOM rendering (for web build)
- **React Native Web** ~0.21.0 - React Native components on web

**Navigation:**
- **@react-navigation/native** 7.1.8 - Navigation support
- **Expo Router** ~6.0.23 - File-based routing

**State Management:**
- **Zustand** 5.0.12 - Lightweight state management

**HTTP & Networking:**
- **Axios** 1.15.0 - HTTP client
- **Socket.IO Client** 4.8.3 - Real-time communication

**Storage & Security:**
- **@react-native-async-storage/async-storage** 2.2.0 - Async key-value storage
- **expo-secure-store** ~15.0.8 - Secure storage for tokens/credentials
- **expo-local-authentication** ~17.0.8 - Biometric auth (fingerprint, Face ID)

**UI & Graphics:**
- **expo-linear-gradient** ~15.0.8 - Gradient backgrounds
- **expo-blur** ~15.0.8 - Blur effects
- **react-native-chart-kit** 6.12.0 - Charts for analytics
- **react-native-svg** 15.12.1 - SVG rendering
- **react-native-qrcode-svg** 6.3.0 - QR code generation
- **react-native-view-shot** 4.0.3 - Screenshot capture

**Fonts & Icons:**
- **@expo-google-fonts/manrope** 0.2.3 - Google Font (Manrope)
- **@expo/vector-icons** 15.0.3 - Icon library

**Camera & Media:**
- **expo-camera** ~17.0.10 - Camera access
- **expo-sharing** ~14.0.8 - Share functionality
- **expo-web-browser** ~15.0.10 - In-app browser

**Animations & Interaction:**
- **react-native-reanimated** ~4.1.1 - Smooth animations
- **react-native-worklets** 0.5.1 - Worklets for animations
- **expo-haptics** ~15.0.8 - Haptic feedback
- **expo-splash-screen** ~31.0.13 - Custom splash screen

**Safe Area & Layout:**
- **react-native-safe-area-context** ~5.6.0 - Safe area handling
- **react-native-screens** ~4.16.0 - Screen optimization

**Utilities:**
- **expo-constants** ~18.0.13 - App constants and manifest info
- **expo-font** ~14.0.11 - Custom font loading
- **expo-linking** ~8.0.11 - Deep linking
- **expo-status-bar** ~3.0.9 - Status bar control

### TypeScript Configuration

**File:** `mobile/tsconfig.json`
- Extends: `expo/tsconfig.base`
- Strict mode enabled
- Path aliases: `@/*` → current directory

### Scripts

```bash
npm start         # Start Expo dev server (interactive menu)
npm run android   # Build for Android
npm run ios       # Build for iOS
npm run web       # Build for web (Expo web)
```

### Configuration

**Key files:**
- `mobile/.env.example` - Environment variables (API URL)
- `mobile/tsconfig.json` - TypeScript configuration
- `mobile/app/` - Expo Router file-based routing structure

**Required Environment Variables:**
- `EXPO_PUBLIC_API_URL` - Backend API URL (e.g., http://192.168.1.5:3000)

---

## Database & Infrastructure

### Database

**Primary:**
- **PostgreSQL** 16 (from `docker-compose.yml`: `postgres:16-alpine`)
- ORM: Prisma 6.5.0 (schema at `backend/prisma/schema.prisma`)
- Migrations: Prisma migrations in `backend/prisma/migrations/`

### Caching

**Cache:**
- **Redis** 7 (from `docker-compose.yml`: `redis:7-alpine`)
- Client: `redis` npm package v5.12.1
- Optional: Gracefully disables if connection fails
- Cache implementation: `backend/src/cache/index.js`

### Platform Requirements

**Development:**
- Node.js 20+ (for backend and admin)
- npm or similar package manager
- PostgreSQL 16 (local or Docker)
- Redis 7 (local or Docker)
- Expo CLI (for mobile: `npm install -g expo-cli`)

**Production (Backend):**
- Docker and Docker Compose
- PostgreSQL 16 database
- Redis 7 cache
- Exposed ports: 3000 (API), 5432 (DB), 6379 (Redis)

---

## Summary Table

| Component | Language | Framework | Runtime | Key Tools |
|-----------|----------|-----------|---------|-----------|
| **Admin** | JS/JSX | React 19 | Node.js | Vite 6, npm |
| **Backend** | Node.js | Express 4 | Node.js 20 | Prisma, Jest, Docker |
| **Mobile** | TS/TSX | React Native 0.81 | Expo 54 | Router, Zustand, Axios |
| **Database** | - | Prisma ORM | PostgreSQL 16 | - |
| **Cache** | - | - | Redis 7 | node-redis |

---

*Stack analysis: 2026-04-25*
