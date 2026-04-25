// Sentry MUST be initialised before any other require so its OpenTelemetry-style
// patches install on the libraries Express loads. Do NOT import anything ESM
// or relative above this comment. Do NOT require('./env') or require('./logger')
// here — both modules expect process.env to be fully populated, which only happens
// after dotenv.config() runs in index.js (line 6 post-plan-03). This file therefore
// reads process.env directly.
const Sentry = require('@sentry/node');

const FORBIDDEN_KEYS = ['pin', 'password', 'cardnumber', 'authorization', 'refreshtoken', 'cookie'];

function scrubObject(o, depth = 0) {
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

function scrubString(s) {
  if (typeof s !== 'string') return s;
  // Order matters: run the more-specific card-number + JWT shape patterns FIRST so
  // `cardNumber=4111111111111111` becomes `cardNumber=[REDACTED_CARD]` (not generic
  // `[REDACTED]`). The trailing key=value strip uses `[^"',}\s\[]+` so it does not
  // re-eat an already-redacted token like `[REDACTED_CARD]` (the leading `[` is excluded).
  return s
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\b\d{13,19}\b/g, '[REDACTED_CARD]')
    .replace(/(["']?(?:pin|password|cardNumber|refreshToken)["']?\s*[:=]\s*["']?)[^"',}\s\[]+/gi, '$1[REDACTED]');
}

function piiBeforeSend(event) {
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

const dsn = process.env.SENTRY_DSN || '';
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.BUILD_SHA || 'dev',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [Sentry.expressIntegration()],
    beforeSend: piiBeforeSend,
  });
}

module.exports = { Sentry, piiBeforeSend, scrubObject, scrubString };
