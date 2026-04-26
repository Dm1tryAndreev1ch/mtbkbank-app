# ADR-001: No CSRF middleware on the admin SPA

**Date:** 2026-04-26
**Status:** Accepted
**Phase:** 3 (Security Hardening — v1.0 milestone)
**Related:** SEC-13, AUTH2-01 (deferred to v1.1), Phase 3 plan 03-14

## Context

The MT-Bank admin SPA (`admin/src/App.jsx`) authenticates against `/api/admin/*`
using a JSON Web Token presented as `Authorization: Bearer <token>`. Post-Phase-2
(SEC-06), the token lives in `localStorage` and flows through React state — the
previous module-scope `let TOKEN` was removed.

Bearer tokens in the `Authorization` header are NOT automatically attached to
cross-origin requests by the browser. Cookies are, by virtue of the browser's
cookie-scope rules; bearers are not. The classic CSRF model — "an attacker site
forces the victim's browser to make a state-changing request on the victim's
behalf, riding ambient credentials" — depends on those ambient credentials. In a
bearer + localStorage shape there are none: an attacker would first need to read
the token out of `localStorage` (an XSS escalation), at which point CSRF
middleware is the wrong layer of defence.

This is the same trade-off SPAs across the industry make when picking
"bearer + localStorage" over "HttpOnly + SameSite cookie" auth. Either choice is
defensible. **Mixing them — cookie auth without CSRF protection — is not.**

## Decision

**v1.0 ships with bearer + localStorage admin auth and NO CSRF middleware.**

The protection against the realistic admin-route threat model is layered across
five complementary mitigations, all landed in Phase 3:

1. **CORS allowlist** (SEC-02 — `backend/src/index.js`): `env.ALLOWED_ORIGINS`
   restricts which `Origin` values can issue authenticated browser requests
   against `/api/admin/*`. In `NODE_ENV=production`, localhost origins are
   rejected regardless of allowlist content. A post-cors 403 reject middleware
   makes the rejection explicit (cors npm with `callback(null, false)` would
   otherwise omit the ACAO header but still 200 the body).
2. **`requireFreshAdmin`** (SEC-08 — `backend/src/middleware/requireFreshAdmin.js`):
   every admin request re-verifies the DB-resident `isAdmin` flag through a
   5-minute LRU cache. A token belonging to a recently-demoted admin is rejected
   within ≤5 minutes.
3. **Origin / Referer header check** on `/api/admin/*` destructive routes
   (defence in depth alongside the CORS allowlist).
4. **Audit log** (SEC-14 — `backend/src/services/auditLog.js`): every admin
   mutation writes an `AuditLog` row inside the same `prisma.$transaction` as
   the mutation. A compromised admin's actions are forensically traceable.
5. **Rate limit on `/admin/*` destructive verbs** (SEC-04 / SEC-08 partial —
   60/min per `actorId`, in-memory). Bulk damage from a stolen token is bounded.

## Consequences

### Accepted risks

- **XSS in the admin SPA leads to localStorage token theft.** The admin is a
  single-page React 19 app with no `dangerouslySetInnerHTML` and length-limited
  error rendering (SEC-07). A Content-Security-Policy header lands in Phase 8
  (DEPLOY-07) initially in report-only mode for v1.0; strict enforcement is
  deferred to v1.1.
- **No CSRF protection in the classic sense.** This is acceptable because the
  authentication shape exposes no ambient-credential CSRF surface. Should the
  shape change (cookies introduced anywhere in the admin path), this ADR is
  void and CSRF protection becomes mandatory.

### Benefits

- Admin SPA stays as a single-file React app without restructuring around
  cookie-aware fetch wrappers.
- No extra round-trip for token issue / refresh ceremonies.
- Backend auth path is one function (`verifyAccessToken`) shared between HTTP
  and the WebSocket handshake (SEC-11). One verifier, one secret, one bug
  surface.

### Deferred

- **HttpOnly cookie migration + `csrf-csrf` middleware (AUTH2-01)** is the v1.1
  successor. When that lands, an ADR-002 will supersede this document.

## Alternatives Considered

### Alternative A: HttpOnly cookie auth + `csrf-csrf` middleware

Migrate the admin SPA to use `Set-Cookie: HttpOnly; SameSite=Strict; Secure` for
the JWT and add `csrf-csrf` (double-submit-token pattern) on every state-changing
admin route. This is the canonical defence-in-depth approach used by most
banking-grade web apps.

**Why deferred to v1.1 (AUTH2-01):**

- Requires admin SPA refactor for cookie-aware fetch wrappers.
- Requires backend route changes for cookie issuance + a CSRF-token endpoint.
- Increases test surface significantly (cookie + CSRF token + same-site
  cross-port edge cases).
- The mitigations 1–5 above cover the realistic threat model for v1.0 traffic
  (single-VPS deploy, internal admin user base, audit log on every mutation).

When the admin moves to cookies in v1.1, this ADR becomes superseded by
ADR-002 documenting the migration.

### Alternative B: Custom signed-token CSRF middleware

Hand-roll a signed-token validator approximating the double-submit pattern.
**Rejected.** Reinvents well-known cryptographic protocols with a high footgun
budget. If we want CSRF, we use `csrf-csrf` (Alternative A).

### Alternative C: Drop authentication on admin routes

Trivially rejected. The `requireAuth → requireFreshAdmin → isAdmin` chain is
mandatory on every `/api/admin/*` route.

## Revisit Conditions

- The admin SPA migrates to cookie auth (AUTH2-01) → write ADR-002 superseding
  this document.
- A new browser-side CSRF vector specific to bearer + localStorage emerges in
  industry guidance (e.g., a change to `Authorization` header behaviour in the
  W3C Fetch standard).
- Production traffic shows brute-force or token-theft incidents → revisit the
  mitigation layering (CSP enforcement, shorter LRU TTL on `requireFreshAdmin`,
  tightened rate limits).

## References

- `.planning/PROJECT.md` Key Decisions: "Admin auth stays bearer + localStorage.
  No CSRF middleware."
- `.planning/REQUIREMENTS.md` SEC-13, AUTH2-01.
- `.planning/phases/03-security-hardening-backend-critical-high/03-CONTEXT.md`
  D-01 … D-15.
- `.planning/phases/03-security-hardening-backend-critical-high/03-RESEARCH.md`
  Pattern 15.
- OWASP CSRF Prevention Cheat Sheet — guidance on JWT in `Authorization` header
  with no ambient credentials.
