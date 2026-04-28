/**
 * ANIM-02 + D-06 unit test.
 * Pins the cleanup contract: unmounting a component mid-spring calls
 * cancelAnimation exactly once on every SharedValue registered with
 * useCancellableAnimation.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  return { ...actual, cancelAnimation: jest.fn() };
});

import {
  cancelAnimation,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useCancellableAnimation } from '../useCancellableAnimation';

let capturedSV: SharedValue<number> | null = null;

function Probe() {
  const register = useCancellableAnimation();
  const sv = useSharedValue(0);
  capturedSV = sv;
  register(sv);
  sv.value = withSpring(1);
  return <Text>probe</Text>;
}

afterEach(() => {
  (cancelAnimation as jest.Mock).mockClear();
  capturedSV = null;
});

test('unmounting mid-spring calls cancelAnimation exactly once with the registered SV', () => {
  const { unmount } = render(<Probe />);
  expect(cancelAnimation).not.toHaveBeenCalled();
  act(() => { unmount(); });
  expect(cancelAnimation).toHaveBeenCalledTimes(1);
  expect((cancelAnimation as jest.Mock).mock.calls[0][0]).toBe(capturedSV);
});

test('re-registering the same SV is idempotent (still cancels once)', () => {
  function DoubleRegister() {
    const register = useCancellableAnimation();
    const sv = useSharedValue(0);
    capturedSV = sv;
    register(sv);
    register(sv);
    return <Text>probe</Text>;
  }
  const { unmount } = render(<DoubleRegister />);
  act(() => { unmount(); });
  expect(cancelAnimation).toHaveBeenCalledTimes(1);
});
