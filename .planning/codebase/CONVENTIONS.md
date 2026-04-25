# Coding Conventions

**Analysis Date:** 2026-04-25

## Overview

The codebase spans four distinct sub-projects (admin, backend, mobile, recent_operations_view_all) with different technology stacks and conventions. This document breaks conventions by sub-project, highlighting shared patterns where they exist.

---

## Admin Panel (React + Vite)

**Tech Stack:** React 19, Vite 6, plain JavaScript/JSX

### Naming Patterns

**Files:**
- PascalCase for React components: `App.jsx`, `LoginPage.tsx`
- camelCase for utilities and handler functions: `withApiBase()`, `parseJsonBody()`
- Index entry point at `src/main.jsx`

**Functions:**
- Descriptive names with camelCase: `setToken()`, `apiFetch()`, `withApiBase()`
- Page components suffixed with `Page`: `LoginPage`, `DashboardPage`, `UsersPage`
- Helper functions prefixed with verb: `handleSubmit()`, `handleSave()`, `handleCreate()`

**Variables:**
- camelCase for local state: `phone`, `pin`, `editing`, `form`
- Constants in UPPER_CASE if module-level: `API`, `NAV_ITEMS`
- Module-level refs: `tokenRef.current` pattern used for persistent token across renders

**JSDoc:**
- Minimal; comments explain intent only when non-obvious
- Russian comments in code for developer notes (e.g., "VITE_API_ORIGIN — прямой URL API")

### Code Style

**Formatting:**
- No linter/formatter configured; style is implicit
- Inline styles preferred over CSS classes for UI
- Use of object spread operator: `{ ...form, name: e.target.value }`

**Error Handling:**
- Try-catch blocks in async handlers
- User-friendly error messages displayed in UI
- Generic "No connection" message when API is unreachable
```javascript
async function apiFetch(path, opts = {}) {
  const res = await fetch(withApiBase(path), { ... });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err.error || `HTTP ${res.status}`).slice(0, 200);
    throw new Error(msg);
  }
  return res.json();
}
```

**State Management:**
- React hooks (useState, useEffect) for local component state
- No global state manager (no Redux, Zustand, etc. in admin)
- Token stored in module-level ref + localStorage
- Polling via useEffect dependencies: `.then(setStats).catch(() => {})`

### API Calls

- Centralized `apiFetch()` helper in `App.jsx` with automatic token injection
- All admin endpoints prefix: `/api/admin/`
- Bearer token in Authorization header
- Error message truncation to 200 chars for display

---

## Backend (Node.js + Express)

**Tech Stack:** Express 4.21, Prisma 6.5, Node 18+, Jest testing

### Naming Patterns

**Files:**
- kebab-case for route files: `auth.js`, `users.js`, `admin.js`
- camelCase for service functions: `processCardDrop()`, `decayAllCardHealth()`
- Directory structure mirrors API routes: `src/routes/`, `src/services/`, `src/middleware/`

**Functions:**
- Descriptive action verbs: `loginHandler()`, `createUser()`, `processCardDrop()`
- Middleware named as functions: `authMiddleware()`, `adminMiddleware()`
- Async handlers always: `async (req, res) => { ... }`
- Validation constants in UPPER_CASE: `ACCESS_TTL = '15m'`, `REFRESH_TTL = '30d'`

**Variables:**
- camelCase throughout
- Request context variables attached to req: `req.userId`, `req.isAdmin`, `req.prisma`
- Constants in UPPER_CASE: `HEALTH_WARNING_THRESHOLD = 30`
- Configuration objects as constants: `RARITY_CONFIG`, `ALERT_CONFIG`

**Comments:**
- Russian inline comments explaining business logic
- Block comments (# ===== SECTION =====) for route grouping
- Comments for non-obvious algorithms: "Алгоритм Луна для банковского номера карты"

### Code Style

**Formatting:**
- No linter configured; style is implicit
- Consistent 2-space indentation observed
- Object destructuring in params: `const { phone, pin } = req.body`

**Error Handling:**
- Try-catch with centralized error response pattern
- All route handlers wrapped in try-catch
- Standard error response: `res.status(500).json({ error: 'Ошибка сервера' })`
- Specific HTTP status codes: 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
```javascript
router.get('/me', async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
```

**Validation:**
- Manual validation in route handlers (no express-validator integration observed)
- Guard clauses at route start: `if (!q || q.length < 3) return res.json([])`
- Parameter sanitization: `Math.min(parseInt(limit) || 50, 100)` to prevent abuse

**Database Patterns:**
- Prisma ORM for all database access
- Query selection with explicit field picks: `select: { id: true, name: true, ... }`
- Aggregation queries with `_count` and `_sum`: `_count: { userCards: true }`
- Transactions via `$transaction()`: `await prisma.$transaction(async (tx) => { ... })`
- Raw SQL with `$executeRaw` for bulk operations

### Authentication

- JWT tokens in Authorization header: `Bearer ${token}`
- Middleware extracts and verifies token: `jwt.verify(token, process.env.JWT_SECRET)`
- Admin flag embedded in JWT payload: `{ userId, isAdmin }`
- Refresh token stored in database: `await req.prisma.user.update({ data: { refreshToken } })`

### Rate Limiting

- Express rate-limit middleware on auth endpoints
- Per-endpoint config: login 10/15min, register 5/1hr, refresh 30/15min
- Standard headers returned: `standardHeaders: true`

---

## Mobile (React Native + Expo + TypeScript)

**Tech Stack:** React Native 0.81, Expo 54, TypeScript, Zustand (state), Axios (HTTP)

### Naming Patterns

**Files:**
- PascalCase for components: `AppAlert.tsx`, `BiometricGuard.tsx`, `CardDropReveal.tsx`
- camelCase for services and utilities: `api.ts`, `useStore.ts`
- TSX extension for React components, TS for logic
- Screens in `app/` directory with route-based naming: `login.tsx`, `transfer.tsx`, `collection.tsx`

**Functions:**
- Component names: PascalCase, exported as default
- Hook names: `useStore()`, `useFonts()`, adhering to React naming convention
- Helper functions: camelCase with descriptive verbs: `isUsableDevApiHost()`, `normalizeApiRootFromUserInput()`
- Type definitions: PascalCase with `Interface` or `Type` suffix: `AppAlertProps`, `AppAlertType`

**Variables:**
- camelCase throughout: `phone`, `pin`, `isLoading`, `unreadCount`
- Shared constants in `constants/theme.ts`: `Fonts`, `Spacing`, `BorderRadius`, `Colors`
- Store state keys: camelCase in Zustand interface

**Comments:**
- Russian comments explaining complex logic
- English JSDoc for exported functions/types (minimal)
- Inline comments for non-obvious mobile platform behavior

### Code Style

**Formatting:**
- TypeScript strict mode enabled: `"strict": true` in tsconfig.json
- Path aliases: `@/*` maps to project root
- No linter/formatter explicitly configured
- StyleSheet.create() for React Native styles (immutable object pattern)
- Consistent padding/spacing via constants: `Spacing.xl`, `Spacing.base`

**Naming for UI:**
- testID pattern for screen elements: `login-phone-input`, `login-pin-input`, `login-submit-button`
- accessibility labels for semantic meaning: `accessibilityLabel={confirmLabel}`
- Style object keys follow RN conventions: `flexDirection`, `paddingHorizontal`

### Error Handling

- Async/await with catch blocks in store actions
```typescript
const login: (phone: string, pin: string) => Promise<boolean> = async (p, pin) => {
  try {
    const res = await api.post('/auth/login', { phone: p, pin });
    // ... handle success
  } catch (error) {
    set({ error: error.message });
    return false;
  }
};
```
- Axios error interception for 401 (token refresh) and generic errors
- User-facing error messages stored in state: `error: string | null`

### State Management

- Zustand store (`useStore`) for global app state
- Persist middleware with SecureStore for credentials
- Store interface defines all state keys: `User`, `AppState`
- Action methods grouped by concern: Auth, Data loading, Settings
- Store selectors: `useStore((state) => state.theme)`

### API Client

- Axios instance with custom config
- Automatic token injection via request interceptor
- 401 response triggers refresh token flow via response interceptor
- Public auth paths excluded from token injection: `/auth/(login|register)`
- Base URL detection: prefer env `EXPO_PUBLIC_API_URL`, fallback to LAN auto-detection
```typescript
function getApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return normalizeApiRootFromUserInput(String(fromEnv));
  }
  const lan = firstUsableLanHost();
  if (lan) return `http://${lan}:3000/api`;
  // Platform-specific fallbacks...
}
```

### Components

- TypeScript interfaces for all props: `AppAlertProps`, `ButtonProps`
- Custom hooks for shared logic: `useFonts()`, `useColorScheme()`
- Animated components via react-native-reanimated: `Animated.View`, `useAnimatedStyle()`
- Haptic feedback: `Haptics.notificationAsync()`
- Shared theme in `constants/theme.ts` — imported everywhere

### Theme & Colors

- Dark/light theme support via React Navigation ThemeProvider
- Color constants: `Colors.primary`, `Colors.error`, `Colors.success`
- Responsive spacing: `Spacing.base`, `Spacing.lg`, `Spacing.xl`
- Font family usage: `'Manrope'`, `'Manrope-Bold'` from @expo-google-fonts/manrope
- Border radius constants: `BorderRadius.base`, `BorderRadius.lg`

---

## recent_operations_view_all

**Status:** Static artifact (screenshot and HTML). No code conventions to document.

---

## Cross-Project Patterns

### Logging

**Backend:**
- `console.error()` for exceptions: `console.error('Stats error:', err)`
- In development, debug logs with `console.log()` for API base URL detection (mobile)
- No centralized logging library (no Winston, Bunyan, etc.)

**Mobile:**
- Development logs only: `if (__DEV__) { console.log('[MTBank API] base URL:', API_BASE); }`
- No production logging configured

**Admin:**
- No logging in admin code; relies on browser console

### Validation

**Backend:**
- Guard clauses at entry: check required fields before processing
- Sanitization of numeric inputs: `Math.min(parseInt(x) || default, max)`
- String length validation: `if (!q || q.length < 3) return res.json([])`

**Mobile:**
- Client-side validation before submission: `if (!p || code.length !== 4) setError(...)`
- API response validation: extract token/user from response, check fields exist

**Admin:**
- Minimal validation; relies on API error responses
- Form state validation before submission: empty checks, field presence

### Comments & Documentation

- **Language:** Russian for business logic, English for technical comments
- **Density:** Sparse; comments only for non-obvious code
- **Block Comments:** Section markers (# ===== NAME ===== ) in backend routes
- **Type Documentation:** Minimal JSDoc; TypeScript interfaces serve as primary doc (mobile)

### Secrets & Configuration

- **Backend:** Reads from `.env` via `dotenv` (not committed)
  - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGINS`, etc.
- **Mobile:** Reads from `EXPO_PUBLIC_*` env vars or `Constants.expoConfig.extra`
  - `EXPO_PUBLIC_API_URL` for API base
- **Admin:** Reads from `.env.development` (Vite)
  - `VITE_API_ORIGIN`, `VITE_API_BASE_URL`

---

## Import Organization

### Backend (Node.js)

1. Built-in modules: `require('dotenv')`
2. Third-party packages: `const express = require('express')`
3. Local modules: `const { authMiddleware } = require('../middleware/auth')`
4. Routes grouped in app setup

### Mobile (TypeScript + Expo)

1. React & React Native imports
2. Expo modules: `import { useFonts } from '@expo-google-fonts/manrope'`
3. Third-party (axios, zustand): `import axios from 'axios'`
4. Local modules: `import { useStore } from '../stores/useStore'`
5. Constants last: `import { Colors, Fonts } from '../constants/theme'`

### Admin (React + Vite)

1. React imports: `import React, { useState } from 'react'`
2. Local components and utilities: `import { LoginPage, DashboardPage } from './pages'`
3. Styles (inline or CSS imports)

---

*Convention analysis: 2026-04-25*
