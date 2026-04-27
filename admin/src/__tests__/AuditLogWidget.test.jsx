/**
 * Phase 4.5 / 04.5-04 / D-09 Plan 4 — AuditLogWidget smoke + codebook coverage.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { actionToRussianLabel, actionIsDestructive } from '../lib/auditCodebook';
import { EmptyState } from '../components/EmptyState';

vi.mock('@sentry/react', () => ({
  __esModule: true, init: vi.fn(),
  captureException: vi.fn(() => 'event-test'),
  ErrorBoundary: ({ children }) => children,
}));
vi.mock('../auth/TokenContext', () => ({
  useToken: () => ({ token: 'test-token', setToken: vi.fn(), clearToken: vi.fn() }),
}));

describe('AuditLogWidget (D-09 Plan 4)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('codebook: BANKCARD_DELETE is destructive, NOTIFICATION_BROADCAST is not', () => {
    expect(actionIsDestructive('BANKCARD_DELETE')).toBe(true);
    expect(actionIsDestructive('NOTIFICATION_BROADCAST')).toBe(false);
  });

  it('codebook: maps known codes to Russian labels and falls back to code', () => {
    expect(actionToRussianLabel('TRADE_CANCEL')).toBe('Отмена обмена');
    expect(actionToRussianLabel('NOTIFICATION_BROADCAST')).toBe('Рассылка уведомлений');
    expect(actionToRussianLabel('UNKNOWN_CODE_XYZ')).toBe('UNKNOWN_CODE_XYZ');
  });

  it('codebook: unknown code is non-destructive', () => {
    expect(actionIsDestructive('UNKNOWN_CODE_XYZ')).toBe(false);
  });

  it('EmptyState locked Russian "Действий пока нет"', () => {
    render(<EmptyState heading="Действий пока нет" body="Здесь появятся записи аудит-лога после первой операции." icon="history" />);
    expect(screen.getByText('Действий пока нет')).toBeTruthy();
    expect(screen.getByText('Здесь появятся записи аудит-лога после первой операции.')).toBeTruthy();
  });

  it('App.jsx imports successfully (AuditLogWidget compiles)', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });

  it('Russian copy + banner locked in App.jsx source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
    expect(src).toContain('AUDIT LOG WIDGET');
    expect(src).toContain('Последние действия администраторов');
    expect(src).toContain('Действий пока нет');
    expect(src).toContain('— (удалён)');
  });
});
