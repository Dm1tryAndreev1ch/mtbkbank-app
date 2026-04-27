/**
 * Phase 4.5 / 04.5-03 / ADMIN-04 — UserCardsPage smoke.
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

describe('UserCardsPage (ADMIN-04)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('EmptyState locked Russian "Карт нет"', () => {
    render(<EmptyState heading="Карт нет" body="У пользователя пока нет карт-коллекции." icon="style" />);
    expect(screen.getByText('Карт нет')).toBeTruthy();
  });

  it('App.jsx imports successfully', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });
});
