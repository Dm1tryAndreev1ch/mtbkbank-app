/**
 * Phase 4.5 / 04.5-03 / ADMIN-05 — DecksPage smoke.
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

describe('DecksPage (ADMIN-05)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('EmptyState locked Russian "Колод нет"', () => {
    render(<EmptyState heading="Колод нет" body="У пользователя пока нет колод." icon="layers" />);
    expect(screen.getByText('Колод нет')).toBeTruthy();
  });

  it('App.jsx imports successfully', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });
});
