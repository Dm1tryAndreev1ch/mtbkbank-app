# MT-Bank (gm-bank-app)

## What This Is

MT-Bank is a gamified mobile banking app where every purchase drops a collectible card (Common → Legendary), users build 5-card decks for stacked cashback (up to 30%+), and cards have HP that decays daily — at 0 HP a card disappears. The product is a multi-app system: a mobile client (React Native + Expo) for end-users, an admin panel (React + Vite) for bank staff, and a Node.js + Express + Prisma backend backed by PostgreSQL and Redis. This milestone takes the existing MVP from "demo-quality with 68 known issues" to a production-ready release with hardened security, polished animated UX, and ops infrastructure to deploy and monitor confidently.

## Core Value

Users can do real banking — accounts, transfers, payments, cards — inside a delightful, smooth, gamified collectible-card experience that **does not lose money, leak data, or feel broken** in production.

## Requirements

### Validated

<!-- Capabilities that already ship in the MVP, inferred from code in backend/, mobile/, admin/. They form the existing surface area we are improving, not greenfield work. -->

- ✓ User can register with phone + 4-digit PIN and log in — existing (`backend/src/routes/auth.js`, `mobile/app/login.tsx`, `mobile/app/register.tsx`)
- ✓ User can refresh access tokens via refresh-token rotation — existing (`backend/src/routes/auth.js`)
- ✓ User has a bank account with balance and transaction history — existing (`backend/src/routes/accounts.js`, `backend/src/routes/transactions.js`)
- ✓ User can top up their account, transfer to another user, and pay — existing (`mobile/app/topup.tsx`, `mobile/app/transfer.tsx`, `mobile/app/payment.tsx`)
- ✓ User can split bills and pay via QR — existing (`mobile/app/split-bill.tsx`, `mobile/app/qr.tsx`)
- ✓ User receives a card drop on a percentage of purchases (rarity-weighted: Common 60%, Rare 25%, Epic 12%, Legendary 3%) — existing (`backend/src/services/cardEngine.js`)
- ✓ User can view their card inventory, build a 5-card active deck, sacrifice cards to restore HP, and convert cards to MB points — existing (`backend/src/routes/cards.js`, `backend/src/routes/decks.js`, `mobile/app/(tabs)/cards.tsx`)
- ✓ Cards in the active deck stack cashback; cards lose HP daily via cron tick and disappear at 0 HP — existing (`cardEngine.tickActiveDeckCardHealth`, scheduled in `backend/src/index.js`)
- ✓ User can trade cards with other users and gift cards — existing (`backend/src/routes/trades.js`, `mobile/app/trade.tsx`)
- ✓ User can buy cards from a shop priced in MB points — existing (`backend/src/routes/cards.js` `POST /buy`)
- ✓ User can complete quests for rewards — existing (`backend/src/routes/quests.js`)
- ✓ User receives realtime updates over Socket.IO and push notifications via Expo — existing (`backend/src/websocket/index.js`, `backend/src/push.js`)
- ✓ User can view spending analytics with charts and configure spending limits and subscriptions — existing (`mobile/app/(tabs)/analytics.tsx`, `backend/src/routes/limits.js`, `backend/src/routes/subscriptions.js`)
- ✓ User can authenticate with biometric (Face ID / fingerprint) on app open — existing (`mobile/components/BiometricGuard.tsx`)
- ✓ Admin can log in to admin panel and view/edit users, decks, cards, and reports — existing (`admin/src/App.jsx`, `backend/src/routes/admin.js`)

### Active

<!-- Hypotheses for this milestone: "MVP → production-ready release v1.0". Driven by user directive: "Fix all bugs, improve app, enhance security, add animations, make production ready." -->

- [ ] **Bugs:** All CRITICAL and HIGH severity issues from `TRIAGE.md` resolved across backend, mobile, and admin (20 issues: 8 CRITICAL + 12 HIGH)
- [ ] **Bugs:** All MEDIUM severity issues from `TRIAGE.md` resolved (18 issues)
- [ ] **Security:** CORS allowlisted via env, no fallback JWT secrets, XSS-safe error rendering, CSRF protection on admin, audit logging for admin actions, sensitive endpoints rate-limited, secrets-in-code removed
- [ ] **Security:** Validation hardened on all state-changing endpoints (negative amounts, Luhn checks, length limits, type coercion), DB constraints prevent invalid balances and duplicate purchases
- [ ] **Reliability:** No silent error swallowing — all `.catch(() => {})` and empty `catch {}` blocks replaced with surfaced errors and user-visible feedback
- [ ] **Reliability:** Single source of truth for auth tokens (no store/api duplication), no race conditions on PIN auto-submit, on `loadAll()` boot, or on token persistence
- [ ] **Animations:** Card-drop reveal animation with rarity-tiered visual feedback (haptics + glow + flip)
- [ ] **Animations:** Deck-building micro-interactions (card add/remove with spring animation, active-deck swap transition)
- [ ] **Animations:** HP-decay visual treatment (low-HP warning pulse, sacrifice/restore animation, card-disappear effect at 0 HP)
- [ ] **Animations:** Tab-bar transitions, screen transitions, button presses, and skeletons replace blank-flash loading states across mobile
- [ ] **Production:** CI pipeline runs lint + typecheck + tests on every PR for backend, mobile, admin
- [ ] **Production:** Backend test suite covers auth, transactions, deck mutation, card buy/sacrifice/convert paths
- [ ] **Production:** Backend deploys via Docker Compose with documented env-var contract, healthcheck endpoint, and a production-grade logger (structured JSON logs)
- [ ] **Production:** Error tracking + crash reporting wired into backend and mobile (e.g., Sentry or equivalent)
- [ ] **Production:** Database has indexes on hot query paths (Transaction, Notification, UserCard) and migrations are idempotent
- [ ] **Production:** Mobile app builds reproducibly via EAS for Android (and iOS if signing available) with environment-driven API URL
- [ ] **Production:** Admin panel has loading states, form validation, and a Content-Security-Policy header
- [ ] **Production:** README and DEVELOPMENT docs reflect actual current setup; deprecated `DEVELOPMENT.md` either fixed or removed

### Out of Scope

- New gameplay mechanics beyond the existing card/deck/HP/trade system — *milestone goal is hardening, not feature expansion*
- Real money / real bank integration — *this remains a simulated banking app; treat all balances as fake currency*
- Mobile app architecture rewrite (e.g. swap Zustand for Redux/Jotai) — *current store works; fix specific bugs in place*
- Admin panel redesign or component-library introduction — *single-file React app stays single-file; we fix bugs and add validation*
- Multi-language i18n — *Russian-only is fine for this milestone; current copy is already Russian*
- LOW-severity issues and pure optimizations from `TRIAGE.md` (17 LOW + 13 Optimization) — *deferred to v1.1; revisit after launch*
- Web build of the mobile app — *Expo web target compiles but is not a launch surface; deprioritize*
- OAuth / social login — *phone + PIN is the validated MVP auth; add later if user research demands it*
- Standalone read-only `recent_operations_view_all/code.html` page — *unclear purpose, treat as historical artifact unless owner clarifies*

## Context

- **Project type:** Brownfield — `/gsd-map-codebase` already produced 7 reference docs in `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS). All planning agents should consult these first.
- **Audit done:** `TRIAGE.md` at repo root catalogs 68 issues with severity, file paths, and line numbers — this is the authoritative bug backlog. Phase 1 of the proposed fix plan in TRIAGE.md was already applied (commits before `d3ee0a3`); Phases 2 + 3 are still open and define most of this milestone's work.
- **Stack baseline:** Backend (Node 20 + Express 4.21 + Prisma 6.5 + PostgreSQL 16 + Redis 7), Mobile (Expo 54 + RN 0.81 + React 19 + Zustand 5 + Reanimated 4), Admin (Vite 6 + React 19). All stacks are current — no major version upgrades needed.
- **Animation library already installed:** `react-native-reanimated`, `react-native-worklets`, `expo-haptics`. Build animations on this stack — do not introduce a new animation library.
- **Realtime infra exists:** Socket.IO is wired end-to-end (server middleware + mobile client). Use `broadcastToUser` for any new realtime UX feedback, do not invent a parallel channel.
- **Test infrastructure:** Jest 30 is installed in backend but coverage is sparse — production phase needs to *grow* the suite, not introduce a new framework.
- **Design system:** "Pristine Vault" — Manrope font, Electric Blue `#4F8EF7`, Gold `#fdcf49`, glassmorphism dark theme. Animations should respect this aesthetic.
- **Test accounts (dev only):** Gold `+79001234567 / 1234`, Silver `+79009876543 / 1234`, Admin `+79000000000 / 0000`. These are **already flagged as a CRITICAL issue** (A-C1) — must be removed from source as part of the security work.
- **Cron loops in backend:** `tickActiveDeckCardHealth()` runs every `ACTIVE_DECK_HP_TICK_MS` ms and `ensureUserActiveDeck` on boot. Production-readiness must not break these scheduled jobs.

## Constraints

- **Tech stack**: Lock to current stack (Node 20, Express, Prisma, PostgreSQL 16, Redis 7, Expo 54, RN 0.81, React 19, Vite 6) — *changing the stack is a different project; this milestone hardens what exists.*
- **Compatibility**: Backend API contract with mobile and admin must not break — *both clients ship from this repo; coordinate any API change with both.*
- **Compatibility**: Existing Prisma migrations must not be rewritten or squashed; new migrations only — *migrations have already been applied to dev databases.*
- **Localization**: Keep Russian copy throughout — *the product is Russian-language; do not introduce English strings to existing screens unless the original was English.*
- **Dependencies**: Animations must use the already-installed `react-native-reanimated` + `react-native-worklets` + `expo-haptics` — *no new animation libraries.*
- **Security**: All bank-app threats apply — secrets out of source, JWT must reject missing `JWT_SECRET`, no admin credentials in UI, sanitize all rendered error strings, validate every numeric input, rate-limit every auth-adjacent endpoint.
- **Performance**: Mobile UI must remain 60fps with animations on — *animations on the JS thread are a regression; prefer Reanimated worklets running on UI thread.*
- **Reversibility**: Every phase commits atomically — *if a phase introduces regressions, it must be revertable as a single unit.*

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat this as a v1 *milestone* on the existing brownfield project, not a fresh greenfield init | Code already exists with 68 catalogued issues; the task is hardening, not rebuilding | — Pending |
| Bug scope = all CRITICAL + HIGH + MEDIUM (38 of 68); LOW + Optimization deferred to v1.1 | LOW issues are cosmetic/edge-case; addressing them inside the v1 push would dilute focus on launch-blockers | — Pending |
| Animations target = the *gamified* paths first (card drop, deck build, HP states), then global polish (transitions, skeletons) | The card system is the differentiator; making it feel great moves the needle more than generic micro-interactions | — Pending |
| Animations stack = `react-native-reanimated` + `expo-haptics` only | Already installed; introducing another animation lib would be churn | — Pending |
| "Production ready" = CI + tests + structured logging + error tracking + healthcheck + Docker deploy + DB indexes + EAS mobile build | Concrete, observable definition — not a vague aspirational state | — Pending |
| Single source of truth for auth tokens lives in the Zustand store; `services/api.ts` reads from store, never writes | Eliminates the M-C2 race condition without inventing a new auth abstraction | — Pending |
| Russian-only copy stays | Existing product is Russian; i18n is a separate concern | — Pending |
| Keep all three apps in this monorepo with shared `.planning/` | Cross-cutting changes (e.g. an API change) need a single roadmap, not three | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-25 after initialization*
