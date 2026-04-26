/**
 * Phase 3 — Plan 03-15 — SEC-06.
 *
 * Single source of truth for the admin SPA JWT.
 *
 * Why this exists:
 *   The previous implementation kept a module-level `tokenRef = { current: ... }`
 *   plus a free `setToken()` function. That is a tampering surface (T-03-15-01)
 *   and a dual-source-of-truth bug magnet (state vs. localStorage drift).
 *
 *   With this provider:
 *     - The token lives in React state (`useState`), never on the module.
 *     - localStorage is mirrored from state inside one `useEffect` — no parallel
 *       write paths from logout handlers (T-03-15-03).
 *     - All reads/writes funnel through `useToken()`, so stale-closure bugs
 *       inside async handlers can't dodge the setter.
 *
 *   Bearer + localStorage stays per LOCKED decision (CLAUDE.md / ADR-001).
 *   localStorage XSS theft (T-03-15-02) is accepted at this milestone; CSP
 *   follow-up belongs to Phase 8.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'admin_token';
const TokenContext = createContext(null);

function readInitial() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    // Private mode / disabled storage — accepted.
    return '';
  }
}

export function TokenProvider({ children }) {
  // Hydrate exactly once on mount; lazy initializer avoids re-reading on every render.
  const [token, setTokenState] = useState(() => readInitial());

  // Mirror state → localStorage. Single side-effect site; logout/login both flow here.
  useEffect(() => {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable — token still works in-memory for the session.
    }
  }, [token]);

  const setToken = useCallback((value) => {
    setTokenState(value || '');
  }, []);

  const clearToken = useCallback(() => {
    setTokenState('');
  }, []);

  const value = useMemo(() => ({ token, setToken, clearToken }), [token, setToken, clearToken]);

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken() {
  const ctx = useContext(TokenContext);
  if (!ctx) {
    throw new Error('useToken must be used inside <TokenProvider>');
  }
  return ctx;
}

// Exposed for tests so the storage key can be cleared/inspected without
// hard-coding a literal in three places.
export const __TOKEN_STORAGE_KEY = STORAGE_KEY;
