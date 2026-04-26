// Plan 04-01 Task 2 — ActionButton single-flight + offline + error-toast pins.
import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));
jest.mock('../../services/api', () => ({}));
jest.mock('../../services/tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  subscribe: () => () => {},
}));
jest.mock('../../services/secureStorageUiPrefs', () => ({
  secureStorageUiPrefs: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { ActionButton } from '../ActionButton';
import { useStore } from '../../stores/useStore';

beforeEach(() => {
  act(() => {
    useStore.setState({
      toast: { ...useStore.getState().toast, queue: [] },
      network: { ...useStore.getState().network, isOnline: true },
      rateLimit: {},
    });
  });
});

test('double-tap fires onPress exactly once (single-flight lock)', async () => {
  const onPress = jest.fn(
    () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
  );
  const { getByTestId } = render(
    <ActionButton onPress={onPress} label="Перевести" testID="btn" />,
  );
  await act(async () => {
    fireEvent.press(getByTestId('btn'));
    fireEvent.press(getByTestId('btn'));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('thrown onPress writes error toast', async () => {
  const onPress = jest.fn(async () => {
    throw new Error('Не удалось');
  });
  const { getByTestId } = render(
    <ActionButton onPress={onPress} label="Перевести" testID="btn" />,
  );
  await act(async () => {
    fireEvent.press(getByTestId('btn'));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  const queue = useStore.getState().toast.queue;
  expect(queue).toHaveLength(1);
  expect(queue[0].type).toBe('error');
  expect(queue[0].message).toBe('Не удалось');
});

test('network.isOnline=false → renders "Нет связи" disabled label', () => {
  act(() => {
    useStore.setState({
      network: { ...useStore.getState().network, isOnline: false },
    });
  });
  const { getByText } = render(
    <ActionButton onPress={jest.fn()} label="Перевести" testID="btn" />,
  );
  expect(getByText('Нет связи')).toBeTruthy();
});
