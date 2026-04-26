/**
 * Plan 04-03 M-M3 — switching transfer method clears recipient input.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('../../services/api', () => ({
  makeTransfer: jest.fn(),
  transferOwn: jest.fn(),
  resolveRecipient: jest.fn(),
  getAccounts: jest.fn(async () => ({ data: [] })),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  // Prefill recipient via query so the form has a non-empty value, but leave
  // method unset so the picker renders first (where method change is wired).
  useLocalSearchParams: () => ({ to: '+79001234567' }),
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));

jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {
      __esModule: true,
      default: { View: ({ children }: any) => children, createAnimatedComponent: (c: any) => c },
      FadeInDown: { delay: () => ({}) },
      useSharedValue: () => ({ value: 1 }),
      useAnimatedStyle: () => ({}),
      withTiming: (v: any) => v,
    };
  }
});

jest.mock('../../services/tokenStore', () => ({
  getAccess: () => 'tok',
  isAuthed: () => true,
  isHydrated: () => true,
  hydrate: jest.fn(async () => {}),
  setTokens: jest.fn(),
  clear: jest.fn(),
  getRefresh: () => null,
  subscribe: () => () => {},
  refreshOnce: jest.fn(),
}));

import { useStore } from '../../stores/useStore';
import TransferScreen from '../../app/transfer';

beforeEach(() => {
  act(() => {
    useStore.setState({
      accounts: [
        { id: 'acc-1', type: 'main', balance: 1000 },
        { id: 'acc-2', type: 'savings', balance: 500 },
      ] as any,
      toast: { ...useStore.getState().toast, queue: [] },
      network: { ...useStore.getState().network, isOnline: true },
      rateLimit: {},
    });
  });
});

test('M-M3: switching method (phone → own) clears recipient', () => {
  const { getByText, getByPlaceholderText, getByTestId, queryByDisplayValue } =
    render(<TransferScreen />);

  // 1. Pick "phone" method from picker → form opens.
  fireEvent.press(getByText('По номеру телефона'));

  // 2. Type a phone recipient.
  const input = getByPlaceholderText('+375 XX XXX-XX-XX');
  fireEvent.changeText(input, '+79001234567');
  expect(queryByDisplayValue(/79001234567/)).toBeTruthy();

  // 3. Tap header back (testID added in impl) to return to picker.
  fireEvent.press(getByTestId('transfer-back'));

  // 4. Pick "Между своими счетами" — this should also clear recipient.
  fireEvent.press(getByText('Между своими счетами'));

  // 5. Switch back to phone form — recipient must be empty (cleared on method change).
  fireEvent.press(getByTestId('transfer-back'));
  fireEvent.press(getByText('По номеру телефона'));
  expect(queryByDisplayValue(/79001234567/)).toBeNull();
});
