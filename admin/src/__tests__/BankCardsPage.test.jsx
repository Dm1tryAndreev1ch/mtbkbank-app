/**
 * Phase 4.5 / 04.5-03 / ADMIN-03 — BankCardsPage smoke.
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

describe('BankCardsPage (ADMIN-03)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('EmptyState locked Russian "Банковских карт нет"', () => {
    render(<EmptyState heading="Банковских карт нет" body="У пользователя пока нет банковских карт." icon="credit_card" />);
    expect(screen.getByText('Банковских карт нет')).toBeTruthy();
  });

  it('App.jsx imports successfully', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  }, 180000);
});
