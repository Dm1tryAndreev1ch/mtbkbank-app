/**
 * REL-03 + D-11 + D-15 + TEST-04 regression test.
 *
 * Pins the synchronous-submit + isSubmitting guard in mobile/app/login.tsx.
 * Five rapid keypad presses ("1","2","3","4","4") MUST result in exactly one
 * useStore.login call. Also pins D-15: phone is initially empty and the cred
 * hint string is gone from the rendered tree.
 *
 * Routing on login success is BootGate's responsibility (Plan 02-07 W4 — covered
 * by BootGate.test.tsx). This test does NOT assert router.replace.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockLogin = jest.fn();
const mockLoadAll = jest.fn();

// Hook-callable stub returning the slice login.tsx destructures via `useStore()`,
// plus a getState() that login.tsx uses via `useStore.getState().login(...)`.
const useStoreHook: any = () => ({
  isLoading: false,
  loadAll: mockLoadAll,
});
useStoreHook.getState = () => ({
  login: (...args: any[]) => mockLogin(...args),
  isLoading: false,
  loadAll: mockLoadAll,
});
useStoreHook.setState = jest.fn();
useStoreHook.subscribe = jest.fn(() => () => {});

jest.mock('../stores/useStore', () => ({
  useStore: useStoreHook,
}));

jest.mock('../services/tokenStore', () => ({
  isAuthed: () => false,
  isHydrated: () => true,
  hydrate: jest.fn(async () => {}),
  setTokens: jest.fn(),
  clear: jest.fn(),
  getAccess: jest.fn(() => null),
  getRefresh: jest.fn(() => null),
  subscribe: jest.fn(() => () => {}),
  refreshOnce: jest.fn(),
}));

jest.mock('../services/api', () => ({
  login: jest.fn(),
  setOnAuthError: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// Defensive: keep Reanimated init out of test path if transitively imported.
jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {};
  }
});

import LoginScreen from '../app/login';

beforeEach(() => {
  mockLogin.mockReset();
  mockLoadAll.mockReset();
});

describe('LoginScreen — REL-03 / D-11 / D-15', () => {
  test('REL-03: 5 keypad presses ("1","2","3","4","4") fire exactly 1 useStore.login call', () => {
    // Phone must be non-empty for submitLogin to proceed past the validation guard.
    // We render, type a phone, then drive 5 rapid keypad presses.
    mockLogin.mockReturnValue(new Promise(() => {})); // never resolves — keeps isSubmitting=true

    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText('+7 (900) 123-45-67'), '+79001234567');

    ['1', '2', '3', '4', '4'].forEach((d) => fireEvent.press(getByText(d)));

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('+79001234567', '1234');
  });

  test('after failed login + retry, total calls bounded by user intent (≤ 2 for two completed flows)', async () => {
    mockLogin.mockResolvedValueOnce(false); // first flow fails
    mockLogin.mockResolvedValueOnce(true);  // second flow succeeds

    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText('+7 (900) 123-45-67'), '+79001234567');

    // First flow.
    ['1', '2', '3', '4'].forEach((d) => fireEvent.press(getByText(d)));
    // Allow the async submitLogin chain to settle (microtask + state flush).
    await act(async () => {
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    });

    // Second flow — PIN was reset on failure (see Plan 02-08 Task 1).
    ['1', '2', '3', '4'].forEach((d) => fireEvent.press(getByText(d)));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockLogin).toHaveBeenCalledTimes(2);
  });

  test('D-15: phone field is initially empty (no +79001234567 prefill)', () => {
    const { queryByDisplayValue } = render(<LoginScreen />);
    expect(queryByDisplayValue('+79001234567')).toBeNull();
  });

  test('D-15: no «Тест» / «ПИН: 1234» hint string visible', () => {
    const { queryByText } = render(<LoginScreen />);
    expect(queryByText(/Тест:?\s*\+79001234567/)).toBeNull();
    expect(queryByText(/ПИН:?\s*1234/)).toBeNull();
  });
});
