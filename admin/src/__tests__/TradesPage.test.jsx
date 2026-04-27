/**
 * Phase 4.5 / 04.5-04 / ADMIN-11 — TradesPage smoke.
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

describe('TradesPage (ADMIN-11)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('EmptyState locked Russian "Обменов не найдено"', () => {
    render(<EmptyState heading="Обменов не найдено" body="Активных или завершённых обменов нет." icon="swap_horiz" />);
    expect(screen.getByText('Обменов не найдено')).toBeTruthy();
    expect(screen.getByText('Активных или завершённых обменов нет.')).toBeTruthy();
  });

  it('App.jsx imports successfully (TradesPage compiles)', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });

  it('Russian copy locked in source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
    expect(src).toContain('TRADES PAGE');
    expect(src).toContain('Обмен отменён');
    expect(src).toContain('Обменов не найдено');
    expect(src).toContain('Карты вернутся к владельцам');
  });
});
