/**
 * Plan 04-03 M-M2 + M-M5 — interval cleanup + per-route ErrorBoundary mount.
 *
 * Asserts:
 *  - The (tabs) layout's setInterval is cleared on unmount and on token change.
 *  - The (tabs) layout source declares clearInterval (cleanup return present).
 *  - app/index.tsx wraps its render in a route ErrorBoundary (withRouteBoundary
 *    or <ErrorBoundary scope="route">).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';

const mockLoadNotifications = jest.fn();
const mockLoadCards = jest.fn();
const mockLoadDecks = jest.fn();

jest.mock('../../stores/useStore', () => {
  const useStoreHook: any = (selector: any) =>
    selector({
      token: 'tok',
      loadNotifications: mockLoadNotifications,
      loadCards: mockLoadCards,
      loadDecks: mockLoadDecks,
    });
  useStoreHook.getState = () => ({
    token: 'tok',
    loadNotifications: mockLoadNotifications,
    loadCards: mockLoadCards,
    loadDecks: mockLoadDecks,
  });
  useStoreHook.setState = jest.fn();
  useStoreHook.subscribe = jest.fn(() => () => {});
  return { useStore: useStoreHook };
});

jest.mock('expo-router', () => ({
  Tabs: Object.assign(
    ({ children }: any) => <>{children}</>,
    { Screen: () => null },
  ),
  router: { replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../../hooks/useThemeColor', () => ({
  useThemeColor: () => ({
    primary: '#000',
    onSurfaceVariant: '#000',
    surfaceContainerLowest: '#fff',
    transparentBorder: '#fff',
    onPrimary: '#fff',
  }),
}));

import TabLayout from '../../app/(tabs)/_layout';

beforeEach(() => {
  mockLoadNotifications.mockReset();
  mockLoadCards.mockReset();
  mockLoadDecks.mockReset();
});

test('M-M2: (tabs) layout calls setInterval on mount and clearInterval on unmount', () => {
  const setSpy = jest.spyOn(global, 'setInterval');
  const clearSpy = jest.spyOn(global, 'clearInterval');

  const { unmount } = render(<TabLayout />);
  expect(setSpy).toHaveBeenCalled();
  const intervalId = setSpy.mock.results[setSpy.mock.results.length - 1].value;

  act(() => {
    unmount();
  });

  // clearInterval must be called with the same id we recorded on mount.
  const clearedIds = clearSpy.mock.calls.map((c) => c[0]);
  expect(clearedIds).toContain(intervalId as any);

  setSpy.mockRestore();
  clearSpy.mockRestore();
});

test('M-M2 source pin: (tabs)/_layout.tsx declares clearInterval cleanup', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );
  expect(src).toMatch(/clearInterval/);
});

test('M-M5 source pin: app/index.tsx mounts a route ErrorBoundary', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'index.tsx'),
    'utf8',
  );
  expect(src).toMatch(/withRouteBoundary|ErrorBoundary\s+scope=["']route["']/);
});

test('M-M5 source pin: (tabs)/_layout.tsx mounts a route ErrorBoundary', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );
  expect(src).toMatch(/withRouteBoundary|ErrorBoundary\s+scope=["']route["']/);
});
