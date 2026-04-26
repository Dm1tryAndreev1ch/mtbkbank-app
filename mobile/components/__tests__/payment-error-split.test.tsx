/**
 * Plan 04-03 M-M1 — payment screen error split.
 *
 * Asserts:
 *  - Payment mutation rejection with VALIDATION_FAILED + issues[] surfaces
 *    InlineError for the "amount" field.
 *  - Background account-reload failure surfaces an info toast and does NOT
 *    set inline error state on the form.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockMakePayment = jest.fn();
const mockGetAccounts = jest.fn();
const mockResolveRecipient = jest.fn();

jest.mock('../../services/api', () => ({
  makePayment: (...args: any[]) => mockMakePayment(...args),
  getAccounts: (...args: any[]) => mockGetAccounts(...args),
  resolveRecipient: (...args: any[]) => mockResolveRecipient(...args),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
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
import PaymentScreen from '../../app/payment';

beforeEach(() => {
  mockMakePayment.mockReset();
  mockGetAccounts.mockReset();
  mockResolveRecipient.mockReset();
  act(() => {
    useStore.setState({
      accounts: [
        // Minimal main account
        { id: 'acc-1', type: 'main', balance: 1000, bankCards: [{ maskedNumber: '1234' }] },
      ] as any,
      toast: { ...useStore.getState().toast, queue: [] },
      network: { ...useStore.getState().network, isOnline: true },
      rateLimit: {},
    });
  });
});

async function navigateToForm(getByText: any) {
  // Drill from category list → service list → form.
  fireEvent.press(getByText('Мобильная связь'));
  fireEvent.press(getByText('A1 (velcom)'));
}

test('M-M1: payment mutation VALIDATION_FAILED renders InlineError near amount', async () => {
  mockMakePayment.mockRejectedValueOnce({
    response: {
      data: {
        error: 'VALIDATION_FAILED',
        message: 'Проверьте введённые данные',
        issues: [{ path: ['amount'], message: 'Минимум 1 ₽' }],
      },
    },
  });

  const { getByText, getByPlaceholderText, findByText } = render(<PaymentScreen />);
  await navigateToForm(getByText);

  fireEvent.changeText(getByPlaceholderText('Введите номер счёта'), '1234567890');
  fireEvent.changeText(getByPlaceholderText('0.00 ₽'), '500');

  // Tap the migrated ActionButton (label "Оплатить").
  await act(async () => {
    fireEvent.press(getByText('Оплатить'));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

  // InlineError text appears on the form.
  expect(await findByText('Минимум 1 ₽')).toBeTruthy();
});

test('M-M1: account-reload failure pushes info toast and does NOT mark form errored', async () => {
  // No mutation triggered here; we only invoke the reload path.
  mockGetAccounts.mockRejectedValueOnce(new Error('network down'));

  const { getByText, queryByText } = render(<PaymentScreen />);
  await navigateToForm(getByText);

  // Wait for the screen's mount-effect reload to fire and reject.
  await waitFor(() => {
    const queue = useStore.getState().toast.queue;
    expect(queue.some((t) => t.type === 'info' && /баланс/i.test(t.message))).toBe(true);
  });

  // Form is NOT marked errored — InlineError text absent.
  expect(queryByText('Минимум 1 ₽')).toBeNull();
});
