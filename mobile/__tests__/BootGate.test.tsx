// mobile/__tests__/BootGate.test.tsx
//
// REL-02 + D-01 / D-04 / D-05 / D-20 + TEST-04 + W4.
// Verifies the 4-state machine, 8s AbortController timeout, retry/exit, onboarded routing,
// AND post-login re-routing (W4 — isAuthed false→true while state===ready triggers /(tabs) replace).
/* eslint-disable @typescript-eslint/no-require-imports, import/first -- jest.mock requires
   require() inside factory + must hoist above SUT import for selector-subscribed Zustand mock. */

import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { Text } from 'react-native';

// Reanimated mock — required because BootError ancestor chain may trigger Reanimated init in some
// jest-expo presets even though BootError itself does not import Reanimated.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const mockHydrate = jest.fn(async (_signal?: AbortSignal) => {});
const mockIsAuthed = jest.fn(() => true);
const mockClear = jest.fn(async () => {});
jest.mock('../services/tokenStore', () => ({
  hydrate: (s?: any) => mockHydrate(s),
  isAuthed: () => mockIsAuthed(),
  clear: () => mockClear(),
  isHydrated: () => true,
  setTokens: jest.fn(),
  getAccess: jest.fn(() => null),
  getRefresh: jest.fn(() => null),
  subscribe: jest.fn(() => () => {}),
  refreshOnce: jest.fn(),
}));

const mockGetOnboarded = jest.fn(async () => true);
jest.mock('../services/secureStorageUiPrefs', () => ({
  secureStorageUiPrefs: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
  getOnboarded: () => mockGetOnboarded(),
  setOnboarded: jest.fn(async () => {}),
}));

// useStore mock — real Zustand store so selector form (useStore((s) => s.isAuthed)) actually
// subscribes, AND useStore.setState({...}) triggers a re-render. Test 8 (W4) drives a state
// transition via setState; the selector-subscribed BootGate re-renders and the routing
// useEffect re-fires because its dep array is [state, isAuthed, onboarded].
// zustand v5: `create()(initializer)` returns a React-hook-callable store. We define the store
// INSIDE the jest.mock factory (jest hoists this above all `const`s) so the binding is the same
// instance the SUT receives, AND we expose it on `globalThis` so the test body can drive
// setState transitions for Test 8 (W4).
jest.mock('../stores/useStore', () => {
  const { create } = require('zustand');
  const store = create()(() => ({ isAuthed: false, onboarded: true, theme: 'light' }));
  (globalThis as any).__mockUseStore = store;
  return { useStore: store };
});
// After hoisting + module init, the store is on globalThis. We import the mocked module to
// guarantee the factory has run before we read the binding.
import { useStore as mockedUseStore } from '../stores/useStore';
const useStore = mockedUseStore as any;

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: any[]) => mockReplace(...args) },
}));

// Theme hook directly returns colors — avoid pulling the real useThemeColor (which uses the
// mocked useStore in a way that would conflict with our store shape).
jest.mock('../hooks/useThemeColor', () => ({
  useThemeColor: () => ({
    primary: '#000',
    onPrimary: '#fff',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    background: '#fff',
    surfaceContainerLowest: '#fff',
    surfaceContainerHigh: '#eee',
    transparentBorder: 'rgba(0,0,0,0.06)',
    outline: '#ccc',
  }),
}));

import BootGate from '../components/BootGate';

beforeEach(() => {
  mockHydrate.mockReset();
  mockHydrate.mockResolvedValue(undefined);
  mockIsAuthed.mockReset();
  mockIsAuthed.mockReturnValue(true);
  mockClear.mockClear();
  mockGetOnboarded.mockReset();
  mockGetOnboarded.mockResolvedValue(true);
  mockReplace.mockClear();
  // Reset Zustand store between tests so isAuthed/onboarded don't leak.
  useStore.setState({ isAuthed: false, onboarded: true });
});

describe('BootGate — REL-02 / D-01 / D-04 / D-05 / D-20 / W4', () => {
  test('happy idle→loading→ready: onboarded + isAuthed → router.replace("/(tabs)") and children render', async () => {
    mockIsAuthed.mockReturnValue(true);
    mockGetOnboarded.mockResolvedValue(true);
    const { findByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    expect(await findByText('HOME')).toBeTruthy();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  test('not onboarded → router.replace("/onboarding")', async () => {
    mockIsAuthed.mockReturnValue(true);
    mockGetOnboarded.mockResolvedValue(false);
    const { findByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    await findByText('HOME');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
  });

  test('onboarded + no token → router.replace("/login")', async () => {
    mockIsAuthed.mockReturnValue(false);
    mockGetOnboarded.mockResolvedValue(true);
    const { findByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    await findByText('HOME');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  test('hydrate rejects → state goes to error, BootError renders', async () => {
    mockHydrate.mockRejectedValue(new Error('boot-fail'));
    const { findByTestId, queryByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    expect(await findByTestId('boot-error')).toBeTruthy();
    expect(queryByText('HOME')).toBeNull();
  });

  test('D-20: 8s AbortController timeout → state goes to error, BootError renders', async () => {
    jest.useFakeTimers();
    let abortObservedFromHydrate = false;
    mockHydrate.mockImplementation((signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          abortObservedFromHydrate = true;
          reject(new Error('Aborted'));
        });
      });
    });
    const { findByTestId } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
    // Drain microtasks scheduled after abort.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
    expect(await findByTestId('boot-error')).toBeTruthy();
    expect(abortObservedFromHydrate).toBe(true);
  });

  test('retry: «Повторить» press re-runs hydrate', async () => {
    mockHydrate.mockRejectedValueOnce(new Error('first-fail'));
    const { findByTestId, findByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    const retryBtn = await findByTestId('boot-error-retry');

    // Second hydrate call resolves.
    mockHydrate.mockResolvedValueOnce(undefined);
    fireEvent.press(retryBtn);
    expect(await findByText('HOME')).toBeTruthy();
    expect(mockHydrate).toHaveBeenCalledTimes(2);
  });

  test('exit: «Выйти» press calls tokenStore.clear() and router.replace("/login")', async () => {
    mockHydrate.mockRejectedValue(new Error('boot-fail'));
    const { findByTestId } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    const exitBtn = await findByTestId('boot-error-exit');
    fireEvent.press(exitBtn);
    await waitFor(() => expect(mockClear).toHaveBeenCalled());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  test('W4: post-login re-routing — isAuthed false→true with state===ready triggers /(tabs) replace', async () => {
    // Initial: isAuthed=false, onboarded=true → lands on /login at end of boot.
    mockIsAuthed.mockReturnValue(false);
    mockGetOnboarded.mockResolvedValue(true);

    const { findByText } = render(
      <BootGate>
        <Text>HOME</Text>
      </BootGate>,
    );
    // Children render (state === 'ready') and initial routing replaces to /login.
    expect(await findByText('HOME')).toBeTruthy();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));

    mockReplace.mockClear();

    // Simulate Plan 02-05's tokenStore.subscribe → useStore.setState({isAuthed: true})
    // after Plan 02-08's submitLogin resolves.
    await act(async () => {
      useStore.setState({ isAuthed: true });
    });

    // Routing useEffect (deps [state, isAuthed, onboarded]) re-fires; replaces to /(tabs).
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });
});
