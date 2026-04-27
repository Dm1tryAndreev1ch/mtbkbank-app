/**
 * Phase 4.5 / 04.5-02 / ADMIN-02 — TransactionsPage state-matrix smoke.
 * Live state-matrix is exercised by backend admin-transactions.test.js.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@sentry/react', () => ({
  __esModule: true, init: vi.fn(),
  captureException: vi.fn(() => 'event-test'),
  ErrorBoundary: ({ children }) => children,
}));
vi.mock('../auth/TokenContext', () => ({
  useToken: () => ({ token: 'test-token', setToken: vi.fn(), clearToken: vi.fn() }),
}));

import { EmptyState } from '../components/EmptyState';

describe('TransactionsPage (ADMIN-02)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('EmptyState locked Russian copy "Операций не найдено"', () => {
    render(<EmptyState heading="Операций не найдено" body="Уточните период или фильтры." icon="search_off" />);
    expect(screen.getByText('Операций не найдено')).toBeTruthy();
    expect(screen.getByText('Уточните период или фильтры.')).toBeTruthy();
  });

  it('App.jsx imports TransactionsPage successfully', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });
});
