/**
 * DEPLOY-07 / A-L2 — Content-Security-Policy middleware.
 *
 * v1.0 ships in Report-Only mode so we can observe violations before
 * switching to enforcement in v1.1.  The policy prevents inline scripts
 * (no 'unsafe-inline' in script-src) and disallows object/frame embedding.
 *
 * To switch to enforcement, replace the header name:
 *   'Content-Security-Policy-Report-Only' → 'Content-Security-Policy'
 *
 * Mount BEFORE route handlers in index.js:
 *   const { cspMiddleware } = require('./middleware/csp');
 *   app.use(cspMiddleware);
 */
'use strict';

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // No 'unsafe-inline' — closes A-L2 inline-script vector
  "script-src 'self'",
  // Allow inline styles for now (common in SPAs); tighten in v1.1
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Disallow embedding in iframes
  "frame-ancestors 'none'",
].join('; ');

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function cspMiddleware(req, res, next) {
  // Report-Only for v1.0 — violations are logged but not blocked
  res.setHeader('Content-Security-Policy-Report-Only', CSP_DIRECTIVES);
  next();
}

module.exports = { cspMiddleware };
