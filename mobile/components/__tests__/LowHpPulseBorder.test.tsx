// Phase 06-05 P05-T1 — LowHpPulseBorder regression pin.
// 1. Renders pulsing border below 30% health threshold.
// 2. Returns null at/above 30%.
// 3. Reduced-motion → static border (no withRepeat invocation).
import React from 'react';
import { render } from '@testing-library/react-native';

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

// Counts calls to withRepeat to assert reduced-motion path skips it.
// Variable name MUST start with `mock` for jest.mock factory hoisting.
const mockWithRepeatSpy = jest.fn((value: any, _count: number, _reverse: boolean) => value);

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  return {
    ...actual,
    withRepeat: (value: any, count: number, reverse: boolean) =>
      mockWithRepeatSpy(value, count, reverse),
  };
});

// Mutable mock for useReducedMotion — flipped per test.
let mockReducedMotionValue = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotionValue,
}));

import { LowHpPulseBorder } from '../cards/LowHpPulseBorder';

describe('LowHpPulseBorder', () => {
  beforeEach(() => {
    mockWithRepeatSpy.mockClear();
    mockReducedMotionValue = false;
  });

  test('renders pulsing border when health/maxHealth < 0.30', () => {
    const { queryByTestId } = render(<LowHpPulseBorder health={10} maxHealth={100} />);
    expect(queryByTestId('low-hp-pulse-border')).not.toBeNull();
    // withRepeat invoked once on the opacity SV.
    expect(mockWithRepeatSpy).toHaveBeenCalled();
  });

  test('returns null at/above 30% threshold', () => {
    const { queryByTestId } = render(<LowHpPulseBorder health={50} maxHealth={100} />);
    expect(queryByTestId('low-hp-pulse-border')).toBeNull();
  });

  test('reduced-motion: renders static border, no withRepeat invocation', () => {
    mockReducedMotionValue = true;
    const { queryByTestId } = render(<LowHpPulseBorder health={5} maxHealth={100} />);
    // Border still mounts — the visual indicator is not removed entirely.
    expect(queryByTestId('low-hp-pulse-border')).not.toBeNull();
    expect(mockWithRepeatSpy).not.toHaveBeenCalled();
  });
});
