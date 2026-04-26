// Plan 04-01 Task 2 — OfflineBanner mount/unmount + restored-toast pin.
import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
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

import { OfflineBanner } from '../OfflineBanner';
import { useStore } from '../../stores/useStore';

beforeEach(() => {
  act(() => {
    useStore.setState({
      network: { ...useStore.getState().network, isOnline: true },
      toast: { ...useStore.getState().toast, queue: [] },
    });
  });
});

test('isOnline=false → renders "Нет связи с сервером"', () => {
  act(() => {
    useStore.setState({
      network: { ...useStore.getState().network, isOnline: false },
    });
  });
  const { getByText } = render(<OfflineBanner />);
  expect(getByText('Нет связи с сервером')).toBeTruthy();
});

test('false→true transition pushes "Связь восстановлена" success toast (key=net_restored)', () => {
  // Start offline
  act(() => {
    useStore.setState({
      network: { ...useStore.getState().network, isOnline: false },
    });
  });
  const { rerender } = render(<OfflineBanner />);
  // Go online
  act(() => {
    useStore.setState({
      network: { ...useStore.getState().network, isOnline: true },
    });
  });
  rerender(<OfflineBanner />);
  const queue = useStore.getState().toast.queue;
  const restored = queue.find((e) => e.key === 'net_restored');
  expect(restored).toBeDefined();
  expect(restored!.message).toBe('Связь восстановлена');
  expect(restored!.type).toBe('success');
});
