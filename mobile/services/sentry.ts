/**
 * Phase 1 OBS-03 — mobile Sentry client.
 *
 * Initialises @sentry/react-native@8 ONLY when EXPO_PUBLIC_SENTRY_DSN is non-empty
 * (silent skip in dev without DSN). Mirrors the backend `instrument.js` redaction
 * shape: scrubs `pin / password / cardNumber / authorization / refreshToken / cookie`
 * (case-insensitive) across request data/headers/cookies/query, contexts.*, exception
 * stacktrace frame vars, breadcrumbs[].data + .message, extra, event.message; and
 * resets event.user to `{id}` only.
 *
 * `beforeBreadcrumb` strips fetch-breadcrumb body for `/auth/(login|register|refresh)`
 * URLs so axios auto-instrumented bodies do not leak `{phone, pin}`.
 *
 * Reference: .planning/phases/01-.../01-RESEARCH.md §5.2 + §5.7 + 01-VALIDATION.md row 1-05-01.
 */
import * as Sentry from '@sentry/react-native';

export const FORBIDDEN_KEYS = ['pin', 'password', 'cardnumber', 'authorization', 'refreshtoken', 'cookie'];

export function scrubObject(o: any, depth = 0): any {
  if (!o || typeof o !== 'object' || depth > 6) return o;
  if (Array.isArray(o)) return o.map((v) => scrubObject(v, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = FORBIDDEN_KEYS.includes(k.toLowerCase())
      ? '[REDACTED]'
      : v && typeof v === 'object'
        ? scrubObject(v, depth + 1)
        : v;
  }
  return out;
}

export function scrubString(s: any): any {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(["']?(?:pin|password|cardNumber|refreshToken)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, '$1[REDACTED]')
    .replace(/\b\d{13,19}\b/g, '[REDACTED_CARD]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
}

export function piiBeforeSend(event: any): any {
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

/**
 * Drop fetch-breadcrumb body for auth URLs — axios bodies on /auth/login etc carry { phone, pin }.
 */
export function authUrlBreadcrumbFilter(breadcrumb: any): any | null {
  if (breadcrumb?.category === 'fetch' && /\/auth\/(login|register|refresh)/.test(breadcrumb.data?.url ?? '')) {
    return { ...breadcrumb, data: { ...breadcrumb.data, body: '[REDACTED]' } };
  }
  return breadcrumb;
}

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isProduction = !__DEV__;

if (dsn) {
  Sentry.init({
    dsn,
    environment: isProduction ? 'production' : 'development',
    debug: __DEV__,
    release: process.env.EXPO_PUBLIC_BUILD_VERSION ?? 'dev',

    tracesSampleRate: isProduction ? 0.1 : 1.0, // D-04
    replaysSessionSampleRate: 0, // D-04 — never proactively record
    replaysOnErrorSampleRate: isProduction ? 1.0 : 0, // D-04 — capture only on crash, only in prod

    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true, // D-04 — mandatory: balances/PINs
        maskAllImages: true,
        maskAllVectors: true,
      }),
      // Phase 8 may add Sentry.reactNavigationIntegration({...}) once router refs are stable.
    ],

    beforeSend: piiBeforeSend,
    beforeBreadcrumb: authUrlBreadcrumbFilter,
  });
}

export { Sentry };
