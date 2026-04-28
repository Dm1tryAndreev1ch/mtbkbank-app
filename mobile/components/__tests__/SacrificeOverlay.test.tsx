// Phase 06-05 P05-T2 — SacrificeOverlay regression pin.
//
// 1. ConfirmDialog mounts with Russian sacrifice title.
// 2. Tap "Пожертвовать" → animation phase runs → onComplete fires.
// 3. Tap "Отмена" → onDismiss fires; onComplete NOT called.
// 4. Reduced-motion → confirm fires onComplete immediately + Toast shown.
// 5. Alert.alert is never invoked by the sacrifice flow.
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  init: jest.fn(),
  wrap: (c: any) => c,
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
  ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
}));
jest.mock('../../services/api', () => ({}));
jest.mock('../../services/tokenStore', () => ({
  getAccess: () => null,
  isAuthed: () => false,
  subscribe: () => () => {},
}));

// Reanimated mock — withSequence runs callbacks synchronously in tests so we
// can assert onComplete fires after the chain.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  // withTiming(toValue, config, callback) — invoke callback synchronously
  // with finished=true (jest fake timers handle the rest).
  const withTiming = (toValue: any, _config?: any, callback?: any) => {
    if (typeof callback === 'function') callback(true);
    return toValue;
  };
  // withSequence — invoke each animation's callback in order; the FINAL
  // animation's callback is the onComplete bridge.
  const withSequence = (...args: any[]) => args[args.length - 1];
  return {
    ...actual,
    withTiming,
    withSequence,
  };
});

// Mutable mock for useReducedMotion — flipped per test.
let mockReducedMotionValue = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotionValue,
}));

// Toast spy (reads via useStore.getState().toast.show).
const mockToastShow = jest.fn();
jest.mock('../../stores/useStore', () => {
  const state = { toast: { show: mockToastShow } };
  const useStore: any = () => state;
  useStore.getState = () => state;
  return { useStore };
});

import { SacrificeOverlay } from '../cards/SacrificeOverlay';

const baseProps = {
  visible: true,
  sourceCard: { id: 'src-1', name: 'Огненный дракон' },
  targetCard: { id: 'tgt-1' },
  healAmount: 25,
};

describe('SacrificeOverlay', () => {
  beforeEach(() => {
    mockReducedMotionValue = false;
    mockToastShow.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('Test 1: ConfirmDialog mounts with Russian title containing card name', () => {
    const { getByText } = render(
      <SacrificeOverlay
        {...baseProps}
        onDismiss={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/Пожертвовать карту «Огненный дракон»/)).toBeTruthy();
  });

  test('Test 2: tap "Пожертвовать" runs animation phase and calls onComplete', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SacrificeOverlay
        {...baseProps}
        onDismiss={jest.fn()}
        onComplete={onComplete}
      />,
    );
    act(() => {
      fireEvent.press(getByTestId('confirm-dialog-confirm'));
      jest.advanceTimersByTime(2500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('Test 3: tap "Отмена" calls onDismiss and NOT onComplete', () => {
    const onDismiss = jest.fn();
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SacrificeOverlay
        {...baseProps}
        onDismiss={onDismiss}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByTestId('confirm-dialog-cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Test 4: reduced-motion → onComplete immediately + success Toast shown', () => {
    mockReducedMotionValue = true;
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SacrificeOverlay
        {...baseProps}
        onDismiss={jest.fn()}
        onComplete={onComplete}
      />,
    );
    act(() => {
      fireEvent.press(getByTestId('confirm-dialog-confirm'));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith('+25 HP', 'success');
  });

  test('Test 5: Alert.alert never invoked by sacrifice flow', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SacrificeOverlay
        {...baseProps}
        onDismiss={jest.fn()}
        onComplete={onComplete}
      />,
    );
    act(() => {
      fireEvent.press(getByTestId('confirm-dialog-confirm'));
      jest.advanceTimersByTime(2500);
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
