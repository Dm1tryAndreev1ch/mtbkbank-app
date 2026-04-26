// Plan 04-01 Task 2 — Toast + ToastHost regression pin.
import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
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

import { ToastHost } from '../Toast';
import { useStore } from '../../stores/useStore';

describe('Toast / ToastHost', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // reset queue
    act(() => {
      useStore.setState({
        toast: { ...useStore.getState().toast, queue: [] },
      });
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('show("msg","error") renders Toast; auto-dismisses after 4s', () => {
    const { queryByText } = render(<ToastHost />);
    act(() => {
      useStore.getState().toast.show('msg', 'error');
    });
    expect(queryByText('msg')).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(useStore.getState().toast.queue).toHaveLength(0);
  });

  test('same key replaces existing entry (queue length stays 1)', () => {
    render(<ToastHost />);
    act(() => {
      useStore.getState().toast.show('first', 'info', { key: 'k1' });
      useStore.getState().toast.show('second', 'info', { key: 'k1' });
    });
    expect(useStore.getState().toast.queue).toHaveLength(1);
    expect(useStore.getState().toast.queue[0].message).toBe('second');
  });
});
