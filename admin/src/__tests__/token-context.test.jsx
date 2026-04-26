/**
 * Phase 3 — Plan 03-15 — SEC-06.
 *
 * Live tests for TokenProvider / useToken. The 03-00 scaffold listed these
 * as it.todo; this plan flips them to real assertions.
 *
 * Threat model coverage:
 *   T-03-15-01 (Tampering): asserts no module-level let/const tokenRef and
 *                           no module-level setToken function in App.jsx.
 *   T-03-15-03 (Repudiation): asserts clearToken() empties state AND
 *                             removes the localStorage entry atomically.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { TokenProvider, useToken, __TOKEN_STORAGE_KEY } from '../auth/TokenContext.jsx';

const wrapper = ({ children }) => <TokenProvider>{children}</TokenProvider>;

describe('TokenContext (SEC-06)', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom may have already cleared */ }
  });

  it('TokenProvider hydrates token from localStorage on mount', () => {
    localStorage.setItem(__TOKEN_STORAGE_KEY, 'jwt-from-storage');
    const { result } = renderHook(() => useToken(), { wrapper });
    expect(result.current.token).toBe('jwt-from-storage');
  });

  it('useToken().setToken(value) updates state AND writes to localStorage', () => {
    const { result } = renderHook(() => useToken(), { wrapper });
    expect(result.current.token).toBe('');

    act(() => {
      result.current.setToken('new-jwt');
    });

    expect(result.current.token).toBe('new-jwt');
    expect(localStorage.getItem(__TOKEN_STORAGE_KEY)).toBe('new-jwt');
  });

  it('useToken().clearToken() empties state AND removes localStorage entry', () => {
    localStorage.setItem(__TOKEN_STORAGE_KEY, 'pre-existing');
    const { result } = renderHook(() => useToken(), { wrapper });
    expect(result.current.token).toBe('pre-existing');

    act(() => {
      result.current.clearToken();
    });

    expect(result.current.token).toBe('');
    expect(localStorage.getItem(__TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('useToken outside <TokenProvider> throws', () => {
    // Suppress the expected React error log noise.
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useToken())).toThrow(/TokenProvider/);
    } finally {
      console.error = consoleError;
    }
  });

  it('admin/src/App.jsx has no module-level let/const tokenRef and no module-level setToken function', () => {
    const appSrc = readFileSync(
      resolve(__dirname, '..', 'App.jsx'),
      'utf8',
    );
    expect(appSrc).not.toMatch(/^(let|const)\s+tokenRef\b/m);
    expect(appSrc).not.toMatch(/^function\s+setToken\s*\(/m);
  });

  it('TokenProvider renders its children', () => {
    const { container } = render(
      <TokenProvider>
        <span data-testid="child">child-ok</span>
      </TokenProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('child-ok');
  });
});
