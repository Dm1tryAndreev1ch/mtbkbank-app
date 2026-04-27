/**
 * Phase 4.5 / 04.5-04 / ADMIN-10 — NotificationsPage smoke.
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

describe('NotificationsPage (ADMIN-10)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('App.jsx imports successfully (NotificationsPage compiles)', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });

  it('Russian audience labels are present in source', async () => {
    // Smoke check that the locked Russian copy has not regressed silently.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
    expect(src).toContain('NOTIFICATIONS PAGE');
    expect(src).toContain('Уведомление отправлено');
    expect(src).toContain('Отправлено уведомлений');
    expect(src).toContain('Сегмент GOLD');
    expect(src).toContain('Один пользователь');
  });
});
