# CLAUDE.md — MT-Bank (gm-bank-app)

Working notes for Claude Code (and any other AI assistant) operating in this repo.

## What This Is

MT-Bank is a gamified mobile banking app MVP. Users do real banking operations (accounts, transfers, payments, QR/split bills) on top of a collectible-card system: every purchase has a chance to drop a card (Common → Legendary), users build 5-card decks for stacked cashback (up to 30%+), and cards have HP that decays daily — at 0 HP a card disappears. There are three apps in this monorepo:

- **`backend/`** — Node.js 20 + Express 4.21 + Prisma 6.5 + PostgreSQL 16 + Redis 7 + Socket.IO 4.8. JWT auth, scheduled cron HP tick, Expo push notifications, REST + WebSocket.
- **`mobile/`** — React Native 0.81 + Expo 54 + React 19 + Zustand 5 + Reanimated 4. File-based routing via Expo Router. Russian copy.
- **`admin/`** — Vite 6 + React 19 single-file SPA (`admin/src/App.jsx`). Used by bank staff.

All three apps are TypeScript-aware (mobile is fully TS; backend and admin are JS).

## Active Milestone — v1.0 Production-Hardening

The MVP exists; this milestone takes it from "demo-quality with 68 catalogued issues" to a production-ready release. Authoritative bug source: **`TRIAGE.md`** at repo root. See `.planning/PROJECT.md` for the full project context, and `.planning/ROADMAP.md` for the 9-phase roadmap.

**9 phases (executed in order):**

1. Observability Foundation + Regression Scaffolding
2. Reliability Foundation + CRITICAL Mobile/Boot
3. Security Hardening + Backend CRITICAL/HIGH
4. MEDIUM Bug Fixes + Shared UX Primitives
5. Animation Foundations
6. Gamified Animations (Card/Deck/HP)
7. Animation Polish + E2E
8. Production Deployment
9. CI Hardening

## Locked Project Decisions

These are committed to in `.planning/PROJECT.md` Key Decisions and propagated through `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`. Do not propose alternatives without surfacing the decision explicitly.

- **Stack is locked.** Node 20, Express 4.21, Prisma 6.5, PostgreSQL 16, Redis 7, Expo 54, RN 0.81, React 19, Reanimated 4, Vite 6. No major version upgrades. No swapping Express for Fastify, Zustand for Redux, etc.
- **Single-VPS / single-replica deploy at v1.0.** Socket.IO rooms refactor still ships (cheap future-proof). Multi-replica adapter / sticky sessions / cron leader-election infrastructure beyond a single Redis lock are deferred to v1.1.
- **Admin auth stays bearer + localStorage. No CSRF middleware.** ADR-001 (written in Phase 3) documents the rationale and Origin-check mitigation. Migrating admin to HttpOnly cookies is v1.1.
- **Sentry on all three apps** for error tracking. PII redaction (`pin / password / cardNumber / Authorization / refreshToken`) is mandatory in `beforeSend`. DSN wired in Phase 1; goes live to users in Phase 8.
- **Russian-only copy** stays. Existing strings are Russian; do not introduce English on existing screens. i18n is out of scope.
- **Animations stack: `react-native-reanimated` + `react-native-worklets` + `expo-haptics` only.** No other animation libraries.
- **HP-decay drift catch-up is deferred to v1.1.** Brief skip on deploy is acceptable. `lastTickAt` migration waits.
- **Bug scope = CRITICAL + HIGH + MEDIUM (38 of 68 in TRIAGE.md).** LOW + Optimization issues defer to v1.1.

## Where to Look

- **`.planning/PROJECT.md`** — project context, validated/active/out-of-scope requirements, locked decisions
- **`.planning/REQUIREMENTS.md`** — 78 v1 requirements with REQ-IDs (OBS, REL, SEC, UX, ANIM, TEST, CI, DEPLOY, DOCS) + traceability to phases
- **`.planning/ROADMAP.md`** — 9 phases with goals, dependencies, success criteria
- **`.planning/STATE.md`** — current phase / plan / wave pointer
- **`.planning/research/`** — `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` — read these before starting any phase
- **`.planning/codebase/`** — `STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `INTEGRATIONS.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md` — current-state map of the existing code
- **`TRIAGE.md`** — authoritative 68-bug catalogue with file:line citations and severity
- **`docs/`** — product/system docs (API, ARCHITECTURE, CARD_SYSTEM, DEPLOYMENT). The deprecated `DEVELOPMENT.md` is being superseded.

> Note: `.planning/` is in `.gitignore` (per `commit_docs: false` in `.planning/config.json`). The contents are local-only for now; that's intentional. Reference them by reading the files; do not assume they are tracked in git history.

## GSD Workflow

This project uses GSD (Get Shit Done) for planning and execution:

- `/gsd-progress` — status snapshot, current phase, suggested next command
- `/gsd-discuss-phase N` — gather context and clarify approach for Phase N before planning
- `/gsd-plan-phase N` — produce the executable PLAN.md for Phase N
- `/gsd-execute-phase N` — execute PLAN.md (wave-based parallelization since `parallelization: true`)
- `/gsd-verify-work` / `/gsd-secure-phase` / `/gsd-code-review` — verification gates

Mode is **YOLO** with **all workflow agents enabled** (Researcher + Plan Checker + Verifier). Granularity is **fine** (8-12 phases, 5-10 plans each). Models: Opus for research/roadmap, Sonnet for synthesizer (per `.planning/config.json`).

## Critical Coding Conventions

- **Russian copy for user-facing strings.** Error messages, toasts, button labels — Russian. Code comments, log messages, identifier names — English.
- **No silent error swallowing.** `.catch(() => {})`, empty `catch {}`, and bare `Alert.alert` are all anti-patterns this milestone is explicitly removing. Add a regression test with the fix.
- **No new fallback secrets.** Backend boots fail-fast via envalid. JWT secrets must come from env; no `'fallback_secret'` strings.
- **No hardcoded credentials in source.** `+79000000000 / 0000` (admin) and `+79001234567 / 1234` (Gold test) belong only in seed scripts gated by env, never in JSX or hint text.
- **Animation worklets cannot reference Zustand.** Worklets get shared values; `runOnJS` only at completion callbacks, never per-frame. ESLint rule (Phase 5) blocks violations.
- **Database migrations.** New migrations only — never rewrite or squash existing ones. Index migrations on `Transaction`, `Notification`, `UserCard` must use `CREATE INDEX CONCURRENTLY` in their own migration file with `-- prisma-disable-transaction` (default Prisma transaction would lock the table).
- **API contract.** The backend serves both mobile and admin. Any breaking API change must update both clients in the same phase.

## Tests

- Backend: `cd backend && npm test` (Jest 30 + supertest, fresh PG16+Redis7 service containers per CI run)
- Mobile: `cd mobile && npm test` (jest-expo + @testing-library/react-native)
- Admin: `cd admin && npx vitest run`
- E2E: Maestro flow in `e2e/card-drop-reveal.yaml` (Phase 7)

Phase 1 ships `backend/tests/regression-phase1.test.js` + `scripts/regression-guard.sh` to pin already-fixed Phase-1 (TRIAGE.md) issues. CI must run `regression-guard.sh` on every PR; do not let any PR silently revert: CORS wildcards, JWT fallback secret, `let TOKEN` in admin, empty `catch {}` in mobile/api.ts or mobile/stores/useStore.ts.

## Test Accounts (dev-only; gated by env)

| Role  | Phone           | PIN  |
|-------|-----------------|------|
| Gold  | `+79001234567`  | 1234 |
| Silver| `+79009876543`  | 1234 |
| Admin | `+79000000000`  | 0000 |

These are set up by `node backend/src/seed/index.js`. They must not appear in client-side source after Phase 2 (SEC-05).

---

*Generated 2026-04-25 during `/gsd-new-project` initialization. Update when locked decisions change or a phase completes.*
