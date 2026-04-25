/**
 * Sentry init for the admin SPA.
 *
 * Side-effect module: importing this file (see admin/src/main.jsx line 1) calls
 * Sentry.init() ONLY when import.meta.env.VITE_SENTRY_DSN is non-empty. In dev
 * without a DSN the SDK silently skips init — Sentry.captureException becomes a
 * no-op and Sentry.ErrorBoundary still renders its fallback.
 *
 * Reference: 01-RESEARCH §5.8 (admin Sentry init in Vite SPA), §5.2 (scrub helpers).
 *
 * Parity contract: piiBeforeSend redacts the same 7 event paths and forbidden
 * keys (pin / password / cardNumber / Authorization / refreshToken / cookie) as
 * the backend (backend/src/sentry.js) and mobile (mobile/sentry.js) Sentry
 * setups. The 14-case redaction test in admin/src/__tests__/sentry-redaction.test.js
 * mirrors the backend/mobile suites — keep all three in lockstep.
 *
 * Locked sampling per D-04: tracesSampleRate 0.1 in production, replay disabled
 * (admin has NO replay — replay is mobile-only).
 */
import * as Sentry from '@sentry/react';

const FORBIDDEN_KEYS = ['pin', 'password', 'cardnumber', 'authorization', 'refreshtoken', 'cookie'];

export function scrubObject(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 6) return o;
  if (Array.isArray(o)) return o.map((v) => scrubObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = FORBIDDEN_KEYS.includes(k.toLowerCase())
      ? '[REDACTED]'
      : (v && typeof v === 'object' ? scrubObject(v, depth + 1) : v);
  }
  return out;
}

export function scrubString(s) {
  if (typeof s !== 'string') return s;
  // Order matters: tag bare 13-19 digit card-number runs FIRST so the
  // generic key=value scrub below does not swallow them as [REDACTED]. The
  // breadcrumbs-message redaction test (`scrubs breadcrumbs[].message via
  // scrubString`) pins the [REDACTED_CARD] tag for the cardNumber=<digits>
  // case — flipping this order causes a [Rule 1] regression. Same applies
  // to JWT detection.
  return s
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\b\d{13,19}\b/g, '[REDACTED_CARD]')
    // Negative lookahead `(?!\[REDACTED)` prevents the generic key=value scrub
    // from clobbering values that the prior JWT/card-digit passes already
    // tagged as `[REDACTED_JWT]` / `[REDACTED_CARD]`. Without it, a payload
    // like `cardNumber=4111111111111111` would render `cardNumber=[REDACTED]`
    // and lose the more specific `[REDACTED_CARD]` tag the breadcrumb test pins.
    .replace(/(["']?(?:pin|password|cardNumber|refreshToken)["']?\s*[:=]\s*["']?)(?!\[REDACTED)[^"',}\s]+/gi, '$1[REDACTED]');
}

export function piiBeforeSend(event) {
  if (event.request) {
    if (event.request.data) event.request.data = scrubObject(event.request.data);
    if (event.request.headers) event.request.headers = scrubObject(event.request.headers);
    if (event.request.cookies) event.request.cookies = '[REDACTED]';
    if (event.request.query_string && typeof event.request.query_string === 'string') {
      event.request.query_string = scrubString(event.request.query_string);
    }
  }
  if (event.contexts) {
    for (const k of Object.keys(event.contexts)) event.contexts[k] = scrubObject(event.contexts[k]);
  }
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value);
      if (ex.stacktrace?.frames) {
        for (const f of ex.stacktrace.frames) if (f.vars) f.vars = scrubObject(f.vars);
      }
    }
  }
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.data) bc.data = scrubObject(bc.data);
      if (bc.message) bc.message = scrubString(bc.message);
    }
  }
  if (event.extra) event.extra = scrubObject(event.extra);
  if (typeof event.message === 'string') event.message = scrubString(event.message);
  if (event.user) event.user = { id: event.user.id };
  return event;
}

const dsn = import.meta.env.VITE_SENTRY_DSN;
const isProduction = import.meta.env.PROD;

if (dsn) {
  Sentry.init({
    dsn,
    environment: isProduction ? 'production' : 'development',
    release: import.meta.env.VITE_BUILD_VERSION ?? 'dev',

    tracesSampleRate: isProduction ? 0.1 : 1.0,        // D-04
    replaysSessionSampleRate: 0,                         // D-04 — admin has no replay
    replaysOnErrorSampleRate: 0,                         // D-04 — admin has no replay

    integrations: [
      // Phase 8 may add Sentry.browserTracingIntegration({}) if traces are valuable
    ],

    beforeSend: piiBeforeSend,
  });
}

export { Sentry };
